import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notifyCustomerOrder } from "@/lib/notifications/orders";

const schema = z.object({ type: z.enum(["cancel", "return"]), reason: z.string().trim().max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Sign in to manage this order." }, { status: 401 }); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid order request and keep the note under 500 characters." }, { status: 400 });
  const { orderId } = await params;
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id }, select: { id: true, fulfilmentStatus: true, paymentStatus: true } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const toStatus = parsed.data.type === "cancel" ? "CANCELLATION_REQUESTED" : "RETURN_REQUESTED";
  const allowed = parsed.data.type === "cancel"
    ? ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING"].includes(order.fulfilmentStatus) && !["FAILED", "REFUNDED"].includes(order.paymentStatus)
    : order.fulfilmentStatus === "DELIVERED";
  if (!allowed) return NextResponse.json({ error: parsed.data.type === "cancel" ? "This order can no longer be cancelled online." : "A return request is available after delivery." }, { status: 409 });
  let statusEventId: string;
  try {
    statusEventId = await prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id: order.id, userId: user.id, fulfilmentStatus: order.fulfilmentStatus }, data: { fulfilmentStatus: toStatus } });
      if (!changed.count) throw new Error("The order changed while the request was being submitted. Refresh and try again.");
      const eventRow = await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: order.fulfilmentStatus, toStatus, actorId: user.id, note: parsed.data.reason || `Customer requested ${parsed.data.type}.` } });
      await tx.auditLog.create({ data: { actorId: user.id, action: `order.${parsed.data.type}.request`, entityType: "Order", entityId: order.id } });
      return eventRow.id;
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be saved." }, { status: 409 });
  }
  await notifyCustomerOrder({ orderId, eventKey: `order-request:${statusEventId}`, subject: parsed.data.type === "cancel" ? "Cancellation request received" : "Return request received", message: `We received your ${parsed.data.type === "cancel" ? "cancellation" : "return"} request for the order. The store team will review it.`, respectPreference: true });
  return NextResponse.json({ ok: true, status: toStatus });
}
