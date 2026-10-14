import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notifyPickup } from "@/lib/notifications/store-pickups";
import { dateTimeInStoreZone, releaseStoreSlot, reserveStoreSlot, validateStoreSlot } from "@/lib/store-slots";
import { releaseReservation } from "@/lib/commerce/inventory";
import { schedulePickupReminders } from "@/lib/notifications/store-pickups";

const schema = z.object({ assignedStaffId: z.string().nullable().optional(), status: z.enum(["PREPARING", "READY", "SCHEDULED", "CANCELLED", "REFUND_PROCESSING"]).optional(), date: z.string().optional(), time: z.string().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { orderId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid pickup update." }, { status: 400 });
  const current = await prisma.order.findFirst({ where: { id: orderId, fulfilment: { type: "STORE_PICKUP" } }, include: { items: true, fulfilment: { include: { pickupSlot: true } }, payments: true } });
  if (!current?.fulfilment) return NextResponse.json({ error: "Store pickup order not found." }, { status: 404 });
  const pickupTransitions: Record<string, string[]> = { PENDING: ["PREPARING", "READY", "SCHEDULED", "CANCELLED", "REFUND_PROCESSING"], PREPARING: ["READY", "SCHEDULED", "CANCELLED", "REFUND_PROCESSING"], READY: ["SCHEDULED", "CANCELLED", "REFUND_PROCESSING"], SCHEDULED: ["PREPARING", "READY", "CANCELLED", "REFUND_PROCESSING"] };
  if (!pickupTransitions[current.fulfilment.status]) return NextResponse.json({ error: "This pickup is already closed." }, { status: 409 });
  if (parsed.data.status && parsed.data.status !== current.fulfilment.status && !pickupTransitions[current.fulfilment.status].includes(parsed.data.status)) return NextResponse.json({ error: "That pickup status change is not allowed." }, { status: 409 });
  if (parsed.data.assignedStaffId) {
    const staff = await prisma.user.findFirst({ where: { id: parsed.data.assignedStaffId, status: "ACTIVE", staffProfile: { status: "ACTIVE" }, roles: { some: { role: { name: "STAFF" } } } }, select: { id: true } });
    if (!staff) return NextResponse.json({ error: "Choose an active staff account." }, { status: 400 });
  }
  const startsAt = parsed.data.date || parsed.data.time ? (parsed.data.date && parsed.data.time ? dateTimeInStoreZone(parsed.data.date, parsed.data.time) : null) : null;
  if ((parsed.data.date || parsed.data.time) && !startsAt) return NextResponse.json({ error: "Provide both a valid pickup date and time." }, { status: 400 });
  if (startsAt) {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
    const invalid = validateStoreSlot(startsAt, settings?.appointmentOpenMinute ?? 600, settings?.appointmentCloseMinute ?? 1200, settings?.openingHours);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  }
  if (parsed.data.status === "REFUND_PROCESSING" && (parsed.data.date || parsed.data.time)) return NextResponse.json({ error: "Reschedule the pickup before starting a refund." }, { status: 400 });
  if (parsed.data.status === "REFUND_PROCESSING" && !current.payments.some((payment) => payment.method === "RAZORPAY" && payment.providerPaymentId && ["PAID", "PARTIALLY_REFUNDED"].includes(payment.status))) return NextResponse.json({ error: "A captured Razorpay payment is required before starting a refund." }, { status: 409 });
  if (parsed.data.status === "CANCELLED" && ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(current.paymentStatus)) return NextResponse.json({ error: "Paid orders must enter refund processing before cancellation." }, { status: 409 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const pickupSlotId = current.fulfilment!.pickupSlotId;
      let nextSlotId = pickupSlotId;
      if (startsAt && current.fulfilment!.pickupSlot?.startsAt.getTime() !== startsAt.getTime()) {
        const settings = await tx.storeSettings.findUnique({ where: { id: "store" } });
        const slot = await reserveStoreSlot(tx, { kind: "PICKUP", startsAt, capacity: settings?.pickupCapacity ?? 5 });
        nextSlotId = slot.id;
      }
      if (nextSlotId !== pickupSlotId && pickupSlotId) await releaseStoreSlot(tx, pickupSlotId);
      const status = parsed.data.status ?? current.fulfilment!.status;
      const claim = await tx.orderFulfilment.updateMany({ where: { id: current.fulfilment!.id, status: current.fulfilment!.status, pickupSlotId, assignedStaffId: current.fulfilment!.assignedStaffId }, data: { pickupSlotId: nextSlotId, status, ...(parsed.data.assignedStaffId !== undefined ? { assignedStaffId: parsed.data.assignedStaffId } : {}), ...(["CANCELLED", "REFUND_PROCESSING"].includes(status) ? { pickupCodeHash: null, pickupCodeExpiresAt: null } : {}) } });
      if (!claim.count) throw new Error("Pickup changed while you were editing it. Refresh and try again.");
      if (nextSlotId !== pickupSlotId) {
        await tx.pickupReminder.updateMany({ where: { fulfilmentId: current.fulfilment!.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Pickup rescheduled" } });
        if (startsAt && status !== "CANCELLED") {
          const settings = await tx.storeSettings.findUnique({ where: { id: "store" } });
          await schedulePickupReminders(tx, current.fulfilment!.id, startsAt, settings?.pickupReminderMinutes ?? [1440, 120]);
        }
      }
      if (startsAt && nextSlotId !== pickupSlotId) await tx.pickupHistory.create({ data: { orderFulfilmentId: current.fulfilment!.id, status, actorId: actor.id, note: `Pickup rescheduled to ${startsAt.toISOString()}` } });
      if (parsed.data.status && parsed.data.status !== current.fulfilment!.status) await tx.pickupHistory.create({ data: { orderFulfilmentId: current.fulfilment!.id, status: parsed.data.status, actorId: actor.id, note: "Owner updated pickup status" } });
      if (status === "PREPARING") await tx.order.update({ where: { id: current.id }, data: { fulfilmentStatus: "PROCESSING" } });
      if (status === "READY") await tx.order.update({ where: { id: current.id }, data: { fulfilmentStatus: "PACKED" } });
      if (status === "CANCELLED") {
        if (nextSlotId) await releaseStoreSlot(tx, nextSlotId);
        await tx.pickupReminder.updateMany({ where: { fulfilmentId: current.fulfilment!.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Pickup cancelled" } });
        for (const item of current.items) if (item.variantId && current.paymentStatus !== "PAID") await releaseReservation(tx, item.variantId, item.quantity, current.id);
        await tx.order.update({ where: { id: current.id }, data: { fulfilmentStatus: "CANCELLED" } });
        await tx.orderStatusEvent.create({ data: { orderId: current.id, fromStatus: current.fulfilmentStatus, toStatus: "CANCELLED", actorId: actor.id, note: "Owner cancelled unpaid store pickup" } });
      }
      if (status === "REFUND_PROCESSING") {
        if (nextSlotId) await releaseStoreSlot(tx, nextSlotId);
        await tx.pickupReminder.updateMany({ where: { fulfilmentId: current.fulfilment!.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Refund processing started" } });
        await tx.order.update({ where: { id: current.id }, data: { fulfilmentStatus: "REFUND_PROCESSING" } });
        await tx.orderStatusEvent.create({ data: { orderId: current.id, fromStatus: current.fulfilmentStatus, toStatus: "REFUND_PROCESSING", actorId: actor.id, note: "Owner started the store pickup refund workflow" } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "store.pickup.update", entityType: "Order", entityId: current.id, metadata: { status, assignedStaffId: parsed.data.assignedStaffId, pickupSlotId: nextSlotId } } });
      return tx.orderFulfilment.findUniqueOrThrow({ where: { id: current.fulfilment!.id }, include: { pickupSlot: true, assignedStaff: { select: { id: true, username: true } } } });
    });
    await notifyPickup({ orderId, eventKey: `store-pickup:${orderId}:owner:${updated.updatedAt.toISOString()}`, title: updated.status === "REFUND_PROCESSING" ? `Refund started for ${current.orderNumber}` : `Pickup ${current.orderNumber} updated`, message: updated.status === "REFUND_PROCESSING" ? "The Owner started the refund process for this store pickup." : `Pickup status: ${updated.status}.` });
    return NextResponse.json({ fulfilment: updated });
  } catch (error) { const message = error instanceof Error ? error.message : "Pickup update failed."; return NextResponse.json({ error: message }, { status: message.includes("no longer available") ? 409 : 400 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { orderId } = await params;
  const parsed = z.object({ action: z.literal("manual-handover"), note: z.string().trim().min(20).max(1000), cashCollected: z.boolean().default(false) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Record a detailed reason for the manual handover." }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, fulfilment: { type: "STORE_PICKUP" } }, include: { items: true, payments: true, fulfilment: true } });
      if (!order?.fulfilment || !["READY", "SCHEDULED", "ARRIVED"].includes(order.fulfilment.status)) throw new Error("Only a ready store pickup may be handed over manually.");
      const paymentMethod = order.payments[0]?.method;
      if (order.paymentStatus !== "PAID" && (paymentMethod !== "CASH_ON_PICKUP" || !parsed.data.cashCollected)) throw new Error("Confirm cash collection before completing this unpaid pickup.");
      const changed = await tx.orderFulfilment.updateMany({ where: { id: order.fulfilment.id, status: { in: ["READY", "SCHEDULED", "ARRIVED"] } }, data: { status: "PICKED_UP", pickedUpAt: new Date(), pickedUpById: actor.id, pickupCodeHash: null, pickupCodeExpiresAt: null, manualHandoverNote: parsed.data.note } });
      if (!changed.count) throw new Error("This order has already been handed over.");
      if (order.paymentStatus !== "PAID") {
        for (const item of order.items) if (item.variantId) await (await import("@/lib/commerce/inventory")).commitReservation(tx, item.variantId, item.quantity, order.id);
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } });
        await tx.payment.updateMany({ where: { orderId: order.id, method: "CASH_ON_PICKUP", status: "PENDING" }, data: { status: "PAID", rawStatus: "collected at manual pickup handover" } });
      }
      await tx.order.update({ where: { id: order.id }, data: { fulfilmentStatus: "DELIVERED" } });
      await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: order.fulfilmentStatus, toStatus: "DELIVERED", actorId: actor.id, note: "Owner-authorized manual pickup handover" } });
      await tx.pickupHistory.create({ data: { orderFulfilmentId: order.fulfilment.id, status: "PICKED_UP", actorId: actor.id, note: `Manual handover: ${parsed.data.note}` } });
      if (order.fulfilment.pickupSlotId) await tx.appointmentSlot.updateMany({ where: { id: order.fulfilment.pickupSlotId, reservedCount: { gt: 0 } }, data: { reservedCount: { decrement: 1 } } });
      await tx.pickupReminder.updateMany({ where: { fulfilmentId: order.fulfilment.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Pickup completed" } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "store.pickup.manual-handover", entityType: "Order", entityId: order.id, metadata: { paymentCollected: parsed.data.cashCollected } } });
    });
    await notifyPickup({ orderId, eventKey: `store-pickup:${orderId}:manual-handover`, title: "Store pickup completed", message: "Your order was handed over at the showroom." });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Manual handover failed." }, { status: 409 }); }
}
