import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { fetchRazorpayRefund, updateRefundStatus } from "@/lib/payments/razorpay";
import { notifyCustomerOrder } from "@/lib/notifications/orders";

export async function POST(_request: Request, { params }: { params: Promise<{ refundId: string }> }) {
  let actor;
  try { actor = await requirePermission(PERMISSIONS.ORDER_REFUND); }
  catch { return NextResponse.json({ error: "Refund permission is required." }, { status: 403 }); }
  const { refundId } = await params;
  const record = await prisma.refund.findUnique({ where: { id: refundId }, include: { payment: { select: { providerPaymentId: true } } } });
  if (!record?.providerRefundId || !record.payment.providerPaymentId) return NextResponse.json({ error: "This refund has no provider reference to reconcile." }, { status: 409 });
  try {
    const provider = await fetchRazorpayRefund(record.payment.providerPaymentId, record.providerRefundId);
    if (provider.payment_id !== record.payment.providerPaymentId || provider.amount !== record.amountPaise) return NextResponse.json({ error: "Provider refund details do not match the stored request." }, { status: 409 });
    const status = provider.status === "processed" ? "PROCESSED" : provider.status === "failed" ? "FAILED" : "PENDING";
    await updateRefundStatus(record.id, status, provider.id);
    await notifyCustomerOrder({ orderId: record.orderId, eventKey: `refund:${record.id}:${status}`, templateKey: "refund.update", subject: status === "PROCESSED" ? "Refund completed" : status === "FAILED" ? "Refund needs attention" : "Refund status updated", message: status === "PROCESSED" ? "Your refund has been processed by the payment provider." : status === "FAILED" ? "The payment provider could not complete the refund. The store team will review it." : "The payment provider is still processing your refund.", respectPreference: false });
    await prisma.auditLog.create({ data: { actorId: actor.id, action: "payment.refund.reconcile", entityType: "Refund", entityId: record.id, metadata: { status } } });
    return NextResponse.json({ ok: true, status });
  } catch {
    return NextResponse.json({ error: "Razorpay could not return the current refund status." }, { status: 502 });
  }
}
