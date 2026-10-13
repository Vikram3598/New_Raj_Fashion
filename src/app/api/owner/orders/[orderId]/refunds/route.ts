import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { createRazorpayRefund, razorpayConfigured, updateRefundStatus } from "@/lib/payments/razorpay";
import { notifyCustomerOrder } from "@/lib/notifications/orders";

const schema = z.object({ requestKey: z.string().uuid(), amountRupees: z.number().positive().max(10000000).optional(), reason: z.string().trim().max(500).optional() });
const reservedStatuses = ["REQUESTED", "PENDING", "PROCESSED", "UNKNOWN"];

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let actor;
  try { actor = await requirePermission(PERMISSIONS.ORDER_REFUND); }
  catch { return NextResponse.json({ error: "Refund permission is required." }, { status: 403 }); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid refund amount and request key." }, { status: 400 });
  if (!razorpayConfigured()) return NextResponse.json({ error: "Razorpay server credentials are not configured." }, { status: 503 });
  const { orderId } = await params;
  const [existingKey, order] = await Promise.all([
    prisma.refund.findUnique({ where: { requestKey: parsed.data.requestKey }, include: { payment: { select: { providerPaymentId: true } } } }),
    prisma.order.findUnique({ where: { id: orderId }, include: { payments: { where: { method: "RAZORPAY" }, orderBy: { createdAt: "desc" } } } }),
  ]);
  if (existingKey) {
    if (existingKey.orderId !== orderId) return NextResponse.json({ error: "Request key is already in use." }, { status: 409 });
    if (["REQUESTED", "UNKNOWN"].includes(existingKey.status) && !existingKey.providerRefundId && existingKey.payment.providerPaymentId) {
      try {
        const providerRefund = await createRazorpayRefund({ paymentId: existingKey.payment.providerPaymentId, amountPaise: existingKey.amountPaise, receipt: parsed.data.requestKey, requestKey: parsed.data.requestKey, orderId, reason: existingKey.reason });
        const status = providerRefund.status === "processed" ? "PROCESSED" : providerRefund.status === "failed" ? "FAILED" : "PENDING";
        await updateRefundStatus(existingKey.id, status, providerRefund.id);
      } catch {
        await prisma.refund.update({ where: { id: existingKey.id }, data: { status: "UNKNOWN" } });
      }
      const retried = await prisma.refund.findUnique({ where: { id: existingKey.id }, select: { id: true, amountPaise: true, status: true, providerRefundId: true } });
      return NextResponse.json({ ok: true, duplicate: true, refund: retried });
    }
    return NextResponse.json({ ok: true, duplicate: true, refund: { id: existingKey.id, amountPaise: existingKey.amountPaise, status: existingKey.status, providerRefundId: existingKey.providerRefundId } });
  }
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (!["CANCELLED", "RETURNED", "REFUND_PROCESSING"].includes(order.fulfilmentStatus)) return NextResponse.json({ error: "Refunds are available after the order is cancelled or a return is accepted." }, { status: 409 });
  const payment = order.payments.find((item) => item.providerPaymentId && ["PAID", "PARTIALLY_REFUNDED"].includes(item.status));
  if (!payment?.providerPaymentId) return NextResponse.json({ error: "No captured Razorpay payment is available for refund." }, { status: 409 });

  let refund;
  let shouldSubmit = false;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.refund.findUnique({ where: { requestKey: parsed.data.requestKey } });
      if (duplicate) return { refund: duplicate, shouldSubmit: false };
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
      const lockedPayment = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!lockedPayment || !lockedPayment.providerPaymentId || !["PAID", "PARTIALLY_REFUNDED"].includes(lockedPayment.status)) throw new Error("The payment is no longer eligible for a refund.");
      const held = await tx.refund.aggregate({ where: { paymentId: lockedPayment.id, status: { in: reservedStatuses } }, _sum: { amountPaise: true } });
      const remaining = lockedPayment.amountPaise - (held._sum.amountPaise ?? 0);
      const amountPaise = parsed.data.amountRupees === undefined ? remaining : Math.round(parsed.data.amountRupees * 100);
      if (amountPaise < 1 || amountPaise > remaining) throw new Error("Refund amount exceeds the remaining refundable balance.");
      const created = await tx.refund.create({ data: { orderId, paymentId: lockedPayment.id, amountPaise, reason: parsed.data.reason || null, requestKey: parsed.data.requestKey, status: "REQUESTED" } });
      if (order.fulfilmentStatus !== "REFUND_PROCESSING") {
        await tx.order.update({ where: { id: orderId }, data: { fulfilmentStatus: "REFUND_PROCESSING" } });
        await tx.orderStatusEvent.create({ data: { orderId, fromStatus: order.fulfilmentStatus, toStatus: "REFUND_PROCESSING", actorId: actor.id, note: "Refund initiated by Owner" } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "payment.refund.request", entityType: "Refund", entityId: created.id, metadata: { orderId, amountPaise } } });
      return { refund: created, shouldSubmit: true };
    });
    refund = result.refund;
    shouldSubmit = result.shouldSubmit;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Refund request could not be saved." }, { status: 409 });
  }
  if (!shouldSubmit) return NextResponse.json({ ok: true, duplicate: true, refund: { id: refund.id, amountPaise: refund.amountPaise, status: refund.status, providerRefundId: refund.providerRefundId } });

  try {
    const providerRefund = await createRazorpayRefund({ paymentId: payment.providerPaymentId, amountPaise: refund.amountPaise, receipt: parsed.data.requestKey, requestKey: parsed.data.requestKey, orderId, reason: parsed.data.reason });
    const status = providerRefund.status === "processed" ? "PROCESSED" : providerRefund.status === "failed" ? "FAILED" : "PENDING";
    await updateRefundStatus(refund.id, status, providerRefund.id);
  } catch {
    // A transport failure can happen after the provider accepts a refund. Keep the amount reserved for manual reconciliation.
    await prisma.refund.update({ where: { id: refund.id }, data: { status: "UNKNOWN" } });
  }
  const latest = await prisma.refund.findUnique({ where: { id: refund.id }, select: { id: true, amountPaise: true, status: true, providerRefundId: true } });
  if (latest) await notifyCustomerOrder({ orderId, eventKey: `refund:${latest.id}:${latest.status}`, templateKey: "refund.update", subject: latest.status === "PROCESSED" ? "Refund completed" : latest.status === "FAILED" ? "Refund needs attention" : "Refund request received", message: latest.status === "PROCESSED" ? "Your refund has been processed by the payment provider." : latest.status === "FAILED" ? "The payment provider could not complete the refund. The store team will review it." : "Your refund request has been sent to the payment provider. You can check its status in your account.", respectPreference: false });
  return NextResponse.json({ ok: true, refund: latest });
}
