import { NextResponse } from "next/server";
import { processRazorpayFailure, processRazorpayPayment, processRazorpayRefundWebhook, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { notifyCustomerOrder } from "@/lib/notifications/orders";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  let payload: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string } };
      refund?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
    };
  };
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 }); }
  const refund = payload.payload?.refund?.entity;
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${payload.event}:${refund?.id ?? "unknown"}`;
  if (["refund.created", "refund.processed", "refund.failed"].includes(payload.event ?? "")) {
    if (!refund?.id || !refund.payment_id || typeof refund.amount !== "number") return NextResponse.json({ error: "Incomplete refund event" }, { status: 400 });
    const status = payload.event === "refund.processed" ? "PROCESSED" : payload.event === "refund.failed" ? "FAILED" : "PENDING";
    try {
      const result = await processRazorpayRefundWebhook({ providerRefundId: refund.id, providerPaymentId: refund.payment_id, amountPaise: refund.amount, status, eventId, eventType: payload.event!, webhookVerified: true });
      if (!result.duplicate) {
        const record = await prisma.refund.findFirst({ where: { providerRefundId: refund.id }, select: { id: true, orderId: true } });
        if (record) await notifyCustomerOrder({ orderId: record.orderId, eventKey: `refund:${record.id}:${status}`, templateKey: "refund.update", subject: status === "PROCESSED" ? "Refund completed" : status === "FAILED" ? "Refund needs attention" : "Refund started", message: status === "PROCESSED" ? "Your refund has been processed by the payment provider." : status === "FAILED" ? "The payment provider could not complete your refund. The store team will review it." : "The payment provider has received your refund request.", respectPreference: false });
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Refund webhook processing failed" }, { status: 400 });
    }
  }
  const payment = payload.payload?.payment?.entity;
  const paymentId = payment?.id; const orderId = payment?.order_id; const eventType = payload.event;
  if (!paymentId || !orderId) return NextResponse.json({ ok: true });
  const paymentEventId = req.headers.get("x-razorpay-event-id") ?? `${eventType}:${paymentId}`;
  try {
    if (eventType === "payment.captured") {
      if (payment?.status !== "captured" || typeof payment.amount !== "number" || !payment.currency) return NextResponse.json({ error: "Incomplete captured payment event" }, { status: 400 });
      const result = await processRazorpayPayment({ providerOrderId: orderId, providerPaymentId: paymentId, eventId: paymentEventId, eventType, amountPaise: payment.amount, currency: payment.currency, webhookVerified: true });
      if (!result.duplicate && "orderId" in result) await notifyCustomerOrder({ orderId: result.orderId, eventKey: `payment:${paymentEventId}`, templateKey: "payment.confirmed", subject: "Payment confirmed", message: "Your payment has been verified and your order is confirmed.", respectPreference: false });
    } else if (eventType === "payment.failed") {
      if (payment.status !== "failed") return NextResponse.json({ error: "Incomplete failed payment event" }, { status: 400 });
      const result = await processRazorpayFailure({ providerOrderId: orderId, providerPaymentId: paymentId, eventId: paymentEventId, webhookVerified: true });
      if (!result.duplicate) {
        const record = await prisma.payment.findUnique({ where: { providerOrderId: orderId }, select: { orderId: true } });
        if (record) await notifyCustomerOrder({ orderId: record.orderId, eventKey: `payment-failed:${paymentEventId}`, templateKey: "payment.failed", subject: "Payment could not be completed", message: "The payment provider reported that this payment failed. The order remains unpaid; you can review it in your account.", respectPreference: false });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, { status: 400 });
  }
}

