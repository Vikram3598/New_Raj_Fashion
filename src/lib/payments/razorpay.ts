import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { confirmPaidOrder, failPendingOrder } from "@/lib/commerce/checkout";

export function razorpayConfigured() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET); }
export async function createRazorpayOrder(input: { amountPaise: number; receipt: string }) {
  if (!razorpayConfigured()) throw new Error("Razorpay server credentials are not configured; online checkout is unavailable.");
  const Razorpay = (await import("razorpay")).default;
  const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
  const order = await client.orders.create({ amount: input.amountPaise, currency: "INR", receipt: input.receipt });
  return { providerOrderId: order.id, amountPaise: input.amountPaise, keyId: process.env.RAZORPAY_KEY_ID!, mode: process.env.RAZORPAY_MODE ?? "sandbox" };
}
export async function createRazorpayRefund(input: { paymentId: string; amountPaise: number; receipt: string; requestKey: string; orderId: string; reason?: string | null }) {
  if (!razorpayConfigured()) throw new Error("Razorpay server credentials are not configured.");
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.paymentId)}/refund`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      "X-Refund-Idempotency": input.requestKey,
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      speed: "normal",
      receipt: input.receipt,
      notes: { order_id: input.orderId, ...(input.reason ? { reason: input.reason.slice(0, 200) } : {}) },
    }),
  });
  if (!response.ok) throw new Error("Razorpay did not accept the refund request.");
  const refund = await response.json() as { id?: string; payment_id?: string; amount?: number; status?: string };
  if (!refund.id || refund.payment_id !== input.paymentId || refund.amount !== input.amountPaise || !["pending", "processed", "failed"].includes(refund.status ?? "")) {
    throw new Error("Razorpay returned an invalid refund response.");
  }
  return refund as { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed" };
}
export async function fetchRazorpayRefund(paymentId: string, refundId: string) {
  if (!razorpayConfigured()) throw new Error("Razorpay server credentials are not configured.");
  const Razorpay = (await import("razorpay")).default;
  const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
  return client.payments.fetchRefund(paymentId, refundId);
}
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET; if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"); const a=Buffer.from(expected); const b=Buffer.from(signature);
  return a.length===b.length && timingSafeEqual(a,b);
}
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret=process.env.RAZORPAY_WEBHOOK_SECRET; if(!secret)return false;
  const expected=createHmac("sha256",secret).update(rawBody).digest("hex");const a=Buffer.from(expected);const b=Buffer.from(signature);
  return a.length===b.length&&timingSafeEqual(a,b);
}
async function fetchVerifiedPayment(paymentId:string,expectedOrderId:string,expectedAmount:number){
  if(!razorpayConfigured())throw new Error("Razorpay credentials are not configured.");
  const Razorpay=(await import("razorpay")).default;const client=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID!,key_secret:process.env.RAZORPAY_KEY_SECRET!});
  const p=await client.payments.fetch(paymentId);
  if(p.status!=="captured"||p.order_id!==expectedOrderId||Number(p.amount)!==expectedAmount||p.currency!=="INR")throw new Error("Provider payment details do not match the pending order.");
}
export async function processRazorpayPayment(input:{providerOrderId:string;providerPaymentId:string;signature?:string;eventId:string;eventType:string;amountPaise?:number;currency?:string;webhookVerified?:boolean;userId?:string}){
  const existing=await prisma.paymentWebhookEvent.findUnique({where:{provider_eventId:{provider:"razorpay",eventId:input.eventId}}});if(existing?.processedAt)return{duplicate:true};
  if(input.signature){if(!verifyRazorpaySignature(input.providerOrderId,input.providerPaymentId,input.signature))throw new Error("Invalid payment signature");}
  else if(!input.webhookVerified||input.eventType!=="payment.captured")throw new Error("A verified captured payment event is required.");
  const payment=await prisma.payment.findUnique({where:{providerOrderId:input.providerOrderId},include:{order:{select:{id:true,userId:true,paymentStatus:true}}}});
  if(!payment||payment.method!=="RAZORPAY")throw new Error("Payment record not found.");
  if(input.userId&&payment.order.userId!==input.userId)throw new Error("Payment record not found.");
  if(payment.status==="PAID")return{duplicate:true};
  if(input.signature){await fetchVerifiedPayment(input.providerPaymentId,input.providerOrderId,payment.amountPaise);}
  else if(input.amountPaise!==payment.amountPaise||input.currency!=="INR")throw new Error("Captured amount or currency does not match the order.");
  await prisma.paymentWebhookEvent.upsert({where:{provider_eventId:{provider:"razorpay",eventId:input.eventId}},update:{},create:{provider:"razorpay",eventId:input.eventId,eventType:input.eventType,payloadHash:input.providerPaymentId}});
  return prisma.$transaction(async tx=>{
    const updated=await tx.payment.updateMany({where:{id:payment.id,status:{in:["PENDING","AUTHORIZED","FAILED"]}},data:{status:"PAID",providerPaymentId:input.providerPaymentId,rawStatus:"captured"}});
    if(updated.count===0){await tx.paymentWebhookEvent.update({where:{provider_eventId:{provider:"razorpay",eventId:input.eventId}},data:{processedAt:new Date()}});return{duplicate:true};}
    await confirmPaidOrder(payment.orderId,tx);
    await tx.paymentWebhookEvent.update({where:{provider_eventId:{provider:"razorpay",eventId:input.eventId}},data:{processedAt:new Date()}});
    return{duplicate:false,orderId:payment.orderId};
  });
}
export async function processRazorpayFailure(input:{providerOrderId:string;providerPaymentId:string;eventId:string;webhookVerified:boolean}){
  if(!input.webhookVerified)throw new Error("Verified webhook required.");
  const payment=await prisma.payment.findUnique({where:{providerOrderId:input.providerOrderId},select:{id:true,orderId:true,status:true,method:true}});
  if(!payment||payment.method!=="RAZORPAY")throw new Error("Payment record not found.");
  await prisma.paymentWebhookEvent.upsert({where:{provider_eventId:{provider:"razorpay",eventId:input.eventId}},update:{},create:{provider:"razorpay",eventId:input.eventId,eventType:"payment.failed",payloadHash:input.providerPaymentId}});
  return prisma.$transaction(async tx=>{
    const failed=await tx.payment.updateMany({where:{id:payment.id,status:{in:["PENDING","AUTHORIZED"]}},data:{status:"FAILED",providerPaymentId:input.providerPaymentId,rawStatus:"failed"}});
    if(failed.count>0)await failPendingOrder(payment.orderId,tx);
    await tx.paymentWebhookEvent.update({where:{provider_eventId:{provider:"razorpay",eventId:input.eventId}},data:{processedAt:new Date()}});
    return{duplicate:failed.count===0};
  });
}

export async function updateRefundStatus(refundId: string, status: "PENDING" | "PROCESSED" | "FAILED", providerRefundId?: string) {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { payment: true, order: { select: { id: true, fulfilmentStatus: true } } } });
    if (!refund) throw new Error("Refund record not found.");
    if (["PROCESSED", "FAILED"].includes(refund.status) && status === "PENDING") return refund;
    if (refund.status === "PROCESSED" && status !== "PROCESSED") return refund;
    await tx.refund.update({ where: { id: refund.id }, data: { status, ...(providerRefundId ? { providerRefundId } : {}) } });
    const paymentRefunds = await tx.refund.aggregate({ where: { paymentId: refund.paymentId, status: "PROCESSED" }, _sum: { amountPaise: true } });
    const refundedForPayment = paymentRefunds._sum.amountPaise ?? 0;
    const paymentStatus = refundedForPayment >= refund.payment.amountPaise ? "REFUNDED" : refundedForPayment > 0 ? "PARTIALLY_REFUNDED" : "PAID";
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: paymentStatus } });

    const paidPayments = await tx.payment.findMany({ where: { orderId: refund.orderId, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } }, select: { id: true, amountPaise: true } });
    const paidTotal = paidPayments.reduce((total, item) => total + item.amountPaise, 0);
    const orderRefunds = await tx.refund.aggregate({ where: { orderId: refund.orderId, status: "PROCESSED" }, _sum: { amountPaise: true } });
    const refundedForOrder = orderRefunds._sum.amountPaise ?? 0;
    const orderPaymentStatus = paidTotal > 0 && refundedForOrder >= paidTotal ? "REFUNDED" : refundedForOrder > 0 ? "PARTIALLY_REFUNDED" : "PAID";
    await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus: orderPaymentStatus } });
    if (orderPaymentStatus === "REFUNDED" && refund.order.fulfilmentStatus === "REFUND_PROCESSING") {
      const completed = await tx.order.updateMany({ where: { id: refund.orderId, fulfilmentStatus: "REFUND_PROCESSING" }, data: { fulfilmentStatus: "REFUNDED" } });
      if (completed.count) {
        await tx.orderStatusEvent.create({ data: { orderId: refund.orderId, fromStatus: "REFUND_PROCESSING", toStatus: "REFUNDED", note: "Provider refund completed" } });
        const pickup = await tx.orderFulfilment.findFirst({ where: { orderId: refund.orderId, type: "STORE_PICKUP", status: { not: "REFUNDED" } }, select: { id: true } });
        if (pickup) {
          const changed = await tx.orderFulfilment.updateMany({ where: { id: pickup.id, status: { not: "REFUNDED" } }, data: { status: "REFUNDED", pickupCodeHash: null, pickupCodeExpiresAt: null } });
          if (changed.count) {
            await tx.pickupHistory.create({ data: { orderFulfilmentId: pickup.id, status: "REFUNDED", note: "Provider confirmed full refund" } });
            await tx.pickupReminder.updateMany({ where: { fulfilmentId: pickup.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Refund completed" } });
          }
        }
      }
    }
    return refund;
  });
}

export async function processRazorpayRefundWebhook(input: { providerRefundId: string; providerPaymentId: string; amountPaise: number; status: "PENDING" | "PROCESSED" | "FAILED"; eventId: string; eventType: string; webhookVerified: boolean }) {
  if (!input.webhookVerified) throw new Error("A verified refund webhook is required.");
  const existingEvent = await prisma.paymentWebhookEvent.findUnique({ where: { provider_eventId: { provider: "razorpay", eventId: input.eventId } } });
  if (existingEvent?.processedAt) return { duplicate: true };
  const refund = await prisma.refund.findFirst({ where: { providerRefundId: input.providerRefundId, payment: { providerPaymentId: input.providerPaymentId } } });
  if (!refund || refund.amountPaise !== input.amountPaise) throw new Error("Refund record does not match the provider event.");
  await prisma.paymentWebhookEvent.upsert({
    where: { provider_eventId: { provider: "razorpay", eventId: input.eventId } },
    update: {},
    create: { provider: "razorpay", eventId: input.eventId, eventType: input.eventType, payloadHash: input.providerRefundId },
  });
  await updateRefundStatus(refund.id, input.status, input.providerRefundId);
  await prisma.paymentWebhookEvent.update({ where: { provider_eventId: { provider: "razorpay", eventId: input.eventId } }, data: { processedAt: new Date() } });
  return { duplicate: false };
}


