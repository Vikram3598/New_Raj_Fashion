import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { notifyPickup } from "@/lib/notifications/store-pickups";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { commitReservation } from "@/lib/commerce/inventory";
import { releaseStoreSlot } from "@/lib/store-slots";

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let staff;
  try { staff = await requirePermission(PERMISSIONS.PICKUP_FULFIL); } catch { return NextResponse.json({ error: "Pickup fulfilment permission is required." }, { status: 403 }); }
  const { orderId } = await params;
  const parsed = z.object({ status: z.enum(["PREPARING", "READY"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid pickup preparation update." }, { status: 400 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, fulfilment: { type: "STORE_PICKUP", assignedStaffId: staff.id } }, include: { fulfilment: true, payments: true } });
      if (!order?.fulfilment) throw new Error("This pickup is not assigned to your account.");
      const cashOnPickup = order.payments.some((payment) => payment.method === "CASH_ON_PICKUP");
      if (order.paymentStatus !== "PAID" && !cashOnPickup) throw new Error("Payment must be confirmed before preparation starts.");
      if (parsed.data.status === "PREPARING" && !["PENDING", "PREPARING"].includes(order.fulfilment.status)) throw new Error("This pickup can no longer be prepared.");
      if (parsed.data.status === "READY" && !["PREPARING", "READY"].includes(order.fulfilment.status)) throw new Error("Start preparation before marking this order ready.");
      const claim = await tx.orderFulfilment.updateMany({ where: { id: order.fulfilment.id, assignedStaffId: staff.id, status: order.fulfilment.status }, data: { status: parsed.data.status } });
      if (!claim.count) throw new Error("Pickup status changed. Refresh and try again.");
      await tx.pickupHistory.create({ data: { orderFulfilmentId: order.fulfilment.id, status: parsed.data.status, actorId: staff.id } });
      const nextOrderStatus = parsed.data.status === "READY" ? "PACKED" : "PROCESSING";
      await tx.order.update({ where: { id: order.id }, data: { fulfilmentStatus: nextOrderStatus } });
      await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: order.fulfilmentStatus, toStatus: nextOrderStatus, actorId: staff.id, note: `Store pickup ${parsed.data.status.toLowerCase()}` } });
      return tx.orderFulfilment.findUniqueOrThrow({ where: { id: order.fulfilment.id }, include: { pickupSlot: true } });
    });
    await notifyPickup({ orderId, eventKey: `store-pickup:${orderId}:status:${updated.status}:${updated.updatedAt.toISOString()}`, title: updated.status === "READY" ? "Your order is ready for pickup" : "Pickup preparation started", message: updated.status === "READY" ? "Your order is ready for collection. Please request your one-time pickup code in your account before arriving." : "The store team has started preparing your pickup order.", includePickupDetails: updated.status === "READY" });
    return NextResponse.json({ fulfilment: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Pickup preparation failed." }, { status: 409 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let staff;
  try { staff = await requirePermission(PERMISSIONS.PICKUP_FULFIL); } catch { return NextResponse.json({ error: "Pickup fulfilment permission is required." }, { status: 403 }); }
  const { orderId } = await params;
  const parsed = z.object({ code: z.string().regex(/^\d{8}$/), cashCollected: z.boolean().default(false) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the customer's eight-digit pickup code." }, { status: 400 });
  try { await assertRateLimit(`pickup-verify:${staff.id}:${orderId}`, 8, 60 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many verification attempts. Contact the Owner for help." }, { status: 429 }); }
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, fulfilment: { type: "STORE_PICKUP", assignedStaffId: staff.id } }, include: { items: true, payments: true, fulfilment: { include: { pickupSlot: true } } } });
      if (!order?.fulfilment) throw new Error("This pickup is not assigned to your account.");
      if (!["READY", "SCHEDULED", "ARRIVED"].includes(order.fulfilment.status)) throw new Error("This pickup is not ready for handover.");
      if (!order.fulfilment.pickupCodeHash || !order.fulfilment.pickupCodeExpiresAt || order.fulfilment.pickupCodeExpiresAt <= new Date()) throw new Error("Pickup code is missing or expired. Ask the customer to request a new code.");
      const submitted = hmacSha256(`${order.id}:${parsed.data.code}`);
      if (!safeEqual(order.fulfilment.pickupCodeHash, submitted)) throw new Error("Pickup code does not match.");
      const cashOnPickup = order.payments.some((payment) => payment.method === "CASH_ON_PICKUP");
      if (order.paymentStatus !== "PAID" && (!cashOnPickup || !parsed.data.cashCollected)) throw new Error("Collect and confirm cash before completing this unpaid pickup.");
      const now = new Date();
      const claim = await tx.orderFulfilment.updateMany({ where: { id: order.fulfilment.id, status: { in: ["READY", "SCHEDULED", "ARRIVED"] }, pickupCodeHash: order.fulfilment.pickupCodeHash, pickupCodeExpiresAt: { gt: now } }, data: { status: "PICKED_UP", pickedUpAt: now, pickedUpById: staff.id, pickupCodeHash: null, pickupCodeExpiresAt: null } });
      if (!claim.count) throw new Error("Pickup was already completed or the code expired.");
      if (order.paymentStatus !== "PAID") {
        for (const item of order.items) if (item.variantId) await commitReservation(tx, item.variantId, item.quantity, order.id);
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } });
        await tx.payment.updateMany({ where: { orderId: order.id, method: "CASH_ON_PICKUP", status: "PENDING" }, data: { status: "PAID", rawStatus: "cash collected at verified pickup handover" } });
      }
      const event = await tx.order.update({ where: { id: order.id }, data: { fulfilmentStatus: "DELIVERED" } });
      await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: order.fulfilmentStatus, toStatus: "DELIVERED", actorId: staff.id, note: "Pickup code verified and order handed over." } });
      await tx.pickupHistory.create({ data: { orderFulfilmentId: order.fulfilment.id, status: "PICKED_UP", actorId: staff.id, note: "Pickup code verified. Handover recorded." } });
      if (order.fulfilment.pickupSlotId) await releaseStoreSlot(tx, order.fulfilment.pickupSlotId);
      await tx.pickupReminder.updateMany({ where: { fulfilmentId: order.fulfilment.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Pickup completed" } });
      await tx.auditLog.create({ data: { actorId: staff.id, action: "store.pickup.handover", entityType: "Order", entityId: order.id, metadata: { orderNumber: order.orderNumber, pickedUpAt: now.toISOString() } } });
      void event;
    });
    await notifyPickup({ orderId, eventKey: `store-pickup:${orderId}:picked-up`, title: "Store pickup completed", message: "Your order has been handed over at the showroom." });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Pickup verification failed." }, { status: 409 }); }
}
