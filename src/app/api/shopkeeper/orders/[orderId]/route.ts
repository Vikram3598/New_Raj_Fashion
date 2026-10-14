import { NextResponse } from "next/server";
import { FulfilmentStatus } from "@prisma/client";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { FULFILMENT_TRANSITIONS, PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { releaseReservation } from "@/lib/commerce/inventory";
import { notifyCustomerOrder } from "@/lib/notifications/orders";
const schema = z.object({
  status: z.nativeEnum(FulfilmentStatus),
  note: z.string().trim().max(500).optional(),
  carrier: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
});
export async function PATCH(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let actor; try { actor = await requirePermission(PERMISSIONS.ORDER_FULFIL); } catch { return NextResponse.json({ error: "You cannot update fulfilment." }, { status: 403 }); }
  const { orderId } = await params; const parsed = schema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid order update." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payments: { select: { method: true } }, fulfilment: { select: { type: true } } } }); if (!order) return null;
      if (order.fulfilment?.type === "STORE_PICKUP") throw new Error("Store pickup orders must be updated through the pickup management workflow.");
      if (!FULFILMENT_TRANSITIONS[order.fulfilmentStatus]?.includes(parsed.data.status)) throw new Error("This order status change is not permitted.");
      const updated = await tx.order.update({ where: { id: orderId }, data: { fulfilmentStatus: parsed.data.status } });
      if (parsed.data.status === "CANCELLED") {
        const cod = order.payments.some((payment) => payment.method === "COD");
        for (const item of order.items) {
          if (!item.variantId) continue;
          if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PARTIALLY_REFUNDED" && order.paymentStatus !== "REFUNDED" && !cod) {
            await releaseReservation(tx, item.variantId, item.quantity, order.id);
          } else {
            await tx.$executeRaw`UPDATE "ProductVariant" SET "stockOnHand" = "stockOnHand" + ${item.quantity}, "updatedAt" = NOW() WHERE id = ${item.variantId}`;
            await tx.inventoryMovement.create({ data: { variantId: item.variantId, deltaOnHand: item.quantity, reason: "order_cancelled", reference: order.id, actorId: actor.id } });
          }
        }
      } else if (parsed.data.status === "RETURNED") {
        for (const item of order.items) {
          if (!item.variantId) continue;
          await tx.$executeRaw`UPDATE "ProductVariant" SET "stockOnHand" = "stockOnHand" + ${item.quantity}, "updatedAt" = NOW() WHERE id = ${item.variantId}`;
          await tx.inventoryMovement.create({ data: { variantId: item.variantId, deltaOnHand: item.quantity, reason: "customer_return", reference: order.id, actorId: actor.id } });
        }
      }
      if (["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(parsed.data.status)) {
        const shipment = await tx.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
        const shipmentData = {
          status: parsed.data.status,
          ...(parsed.data.carrier ? { carrier: parsed.data.carrier } : {}),
          ...(parsed.data.trackingNumber ? { trackingNumber: parsed.data.trackingNumber } : {}),
        };
        if (shipment) await tx.shipment.update({ where: { id: shipment.id }, data: shipmentData });
        else await tx.shipment.create({ data: { orderId, ...shipmentData } });
      }
      if (parsed.data.status === "DELIVERED" && order.payments.some((payment) => payment.method === "COD")) {
        await tx.payment.updateMany({ where: { orderId, method: "COD", status: "PENDING" }, data: { status: "PAID", rawStatus: "cash_collected" } });
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID" } });
      }
      const event = await tx.orderStatusEvent.create({ data: { orderId, fromStatus: order.fulfilmentStatus, toStatus: parsed.data.status, actorId: actor.id, note: parsed.data.note } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "order.fulfilment.update", entityType: "Order", entityId: orderId, metadata: { from: order.fulfilmentStatus, to: parsed.data.status } } }); return { updated, eventId: event.id };
    });
    if (!result) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    await notifyCustomerOrder({ orderId, eventKey: `order-status:${result.eventId}`, subject: `Order ${parsed.data.status.replaceAll("_", " ").toLowerCase()}`, message: `Your order status is now ${parsed.data.status.replaceAll("_", " ").toLowerCase()}.${parsed.data.trackingNumber ? ` Tracking number: ${parsed.data.trackingNumber}.` : ""}` });
    return NextResponse.json({ ok: true, status: result.updated.fulfilmentStatus });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Order could not be updated." }, { status: 400 }); }
}
