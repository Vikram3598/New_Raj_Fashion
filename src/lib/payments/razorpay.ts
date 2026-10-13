import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { confirmPaidOrder } from "@/lib/commerce/checkout";

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export async function createRazorpayOrder(input: { amountPaise: number; receipt: string }) {
  if (!razorpayConfigured()) {
    return {
      providerOrderId: `sandbox_order_${input.receipt}`,
      amountPaise: input.amountPaise,
      keyId: process.env.RAZORPAY_KEY_ID ?? "",
      mode: "credentials_missing",
    };
  }
  const Razorpay = (await import("razorpay")).default;
  const client = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
  const order = await client.orders.create({
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt,
  });
  return {
    providerOrderId: order.id,
    amountPaise: input.amountPaise,
    keyId: process.env.RAZORPAY_KEY_ID!,
    mode: process.env.RAZORPAY_MODE ?? "sandbox",
  };
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function processRazorpayPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  signature?: string;
  eventId: string;
}) {
  const existingEvent = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_eventId: { provider: "razorpay", eventId: input.eventId } },
  });
  if (existingEvent?.processedAt) return { duplicate: true };

  await prisma.paymentWebhookEvent.upsert({
    where: { provider_eventId: { provider: "razorpay", eventId: input.eventId } },
    update: {},
    create: {
      provider: "razorpay",
      eventId: input.eventId,
      eventType: "payment",
      payloadHash: input.providerPaymentId,
    },
  });

  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: input.providerOrderId },
  });
  if (!payment) throw new Error("Payment record not found");
  if (payment.status === "PAID") {
    await prisma.paymentWebhookEvent.update({
      where: { provider_eventId: { provider: "razorpay", eventId: input.eventId } },
      data: { processedAt: new Date() },
    });
    return { duplicate: true };
  }

  if (input.signature && !verifyRazorpaySignature(input.providerOrderId, input.providerPaymentId, input.signature)) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", rawStatus: "invalid_signature" },
    });
    throw new Error("Invalid payment signature");
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      providerPaymentId: input.providerPaymentId,
      rawStatus: "captured",
    },
  });
  await confirmPaidOrder(payment.orderId);
  await prisma.paymentWebhookEvent.update({
    where: { provider_eventId: { provider: "razorpay", eventId: input.eventId } },
    data: { processedAt: new Date() },
  });
  return { duplicate: false, orderId: payment.orderId };
}
