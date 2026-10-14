import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { quoteCart } from "@/lib/commerce/pricing";
import { commitReservation, releaseReservation, reserveStock } from "@/lib/commerce/inventory";
import { createRazorpayOrder } from "@/lib/payments/razorpay";
import { reserveStoreSlot, validateStoreSlot } from "@/lib/store-slots";
import { schedulePickupReminders } from "@/lib/notifications/store-pickups";

function orderNumber() {
  const y = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "2-digit" });
  return `NRF${y}${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function placeOrder(input: {
  userId: string;
  cartId: string;
  addressId?: string;
  method: "RAZORPAY" | "COD" | "CASH_ON_PICKUP";
  fulfilmentType?: "DELIVERY" | "STORE_PICKUP";
  pickupAt?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const fulfilmentType = input.fulfilmentType ?? "DELIVERY";
    const address = fulfilmentType === "DELIVERY" ? await tx.address.findFirst({ where: { id: input.addressId ?? "", userId: input.userId } }) : null;
    if (fulfilmentType === "DELIVERY" && !address) throw new Error("Please select a valid delivery address.");
    const settings = await tx.storeSettings.findUnique({ where: { id: "store" } });
    const payCfg = (settings?.paymentConfig as { codEnabled?: boolean } | null) ?? {};
    if (input.method === "COD" && !payCfg.codEnabled) {
      throw new Error("Cash on Delivery is not enabled.");
    }
    if (input.method === "CASH_ON_PICKUP" && (fulfilmentType !== "STORE_PICKUP" || !settings?.allowCashOnPickup)) throw new Error("Cash on Pickup is not enabled.");
    if (fulfilmentType === "STORE_PICKUP" && !input.pickupAt) throw new Error("Choose an available pickup time.");
    if (fulfilmentType === "DELIVERY" && input.method === "CASH_ON_PICKUP") throw new Error("Cash on Pickup is only available for store collection.");
    if (fulfilmentType === "STORE_PICKUP" && input.method === "COD") throw new Error("Cash on Delivery is not available for store pickup.");
    if (fulfilmentType === "STORE_PICKUP") {
      const invalidSlot = validateStoreSlot(input.pickupAt!, settings?.appointmentOpenMinute ?? 600, settings?.appointmentCloseMinute ?? 1200, settings?.openingHours);
      if (invalidSlot) throw new Error(invalidSlot);
    }
    const pickupSlot = fulfilmentType === "STORE_PICKUP" ? await reserveStoreSlot(tx, { kind: "PICKUP", startsAt: input.pickupAt!, capacity: settings?.pickupCapacity ?? 5 }) : null;
    const quote = await quoteCart(input.cartId, null, address?.postalCode, { includeShipping: fulfilmentType === "DELIVERY", client: tx });
    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        userId: input.userId,
        addressId: address?.id ?? null,
        fulfilmentStatus: input.method === "CASH_ON_PICKUP" ? "CONFIRMED" : "PENDING_CONFIRMATION",
        paymentStatus: input.method === "COD" ? "PENDING" : "PENDING",
        couponCodeSnapshot: quote.couponCode,
        subtotalPaise: quote.subtotalPaise,
        discountPaise: quote.discountPaise,
        shippingPaise: quote.shippingPaise,
        taxPaise: quote.taxPaise,
        totalPaise: quote.totalPaise,
        shippingSnapshot: fulfilmentType === "STORE_PICKUP" ? {
          fulfilmentType: "STORE_PICKUP", storeName: settings?.storeName ?? "New Raj Fashion and Raj Saree Showroom",
          address: [settings?.address, settings?.city, settings?.state, settings?.postalCode].filter(Boolean).join(", "),
          phone: settings?.phone ?? null, pickupAt: input.pickupAt!.toISOString(),
        } : {
          recipient: address!.recipient,
          line1: address!.line1,
          line2: address!.line2,
          city: address!.city,
          state: address!.state,
          postalCode: address!.postalCode,
          phone: address!.phone,
        },
        items: {
          create: quote.lines.map((l) => ({
            variantId: l.variantId,
            productName: l.productName,
            sku: l.sku,
            variantTitle: l.variantTitle,
            quantity: l.quantity,
            unitPricePaise: l.unitPricePaise,
            lineTotalPaise: l.lineTotalPaise,
          })),
        },
        statusHistory: { create: { toStatus: input.method === "CASH_ON_PICKUP" ? "CONFIRMED" : "PENDING_CONFIRMATION", note: "Order created" } },
        fulfilment: { create: { type: fulfilmentType, pickupSlotId: pickupSlot?.id, status: "PENDING" } },
      },
    });

    if (pickupSlot) {
      const fulfilment = await tx.orderFulfilment.findUniqueOrThrow({ where: { orderId: order.id }, select: { id: true } });
      await schedulePickupReminders(tx, fulfilment.id, pickupSlot.startsAt, settings?.pickupReminderMinutes ?? [1440, 120]);
    }

    for (const line of quote.lines) {
      await reserveStock(tx, line.variantId, line.quantity, order.id);
    }

    if (quote.couponCode) {
      await tx.coupon.updateMany({
        where: { code: quote.couponCode },
        data: { usedCount: { increment: 1 } },
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: input.cartId } });

    if (input.method === "COD") {
      for (const line of quote.lines) {
        await commitReservation(tx, line.variantId, line.quantity, order.id);
      }
      await tx.order.update({
        where: { id: order.id },
        data: { fulfilmentStatus: "CONFIRMED" },
      });
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "cod",
          method: "COD",
          status: "PENDING",
          amountPaise: quote.totalPaise,
          idempotencyKey: `cod:${order.id}`,
        },
      });
      return { orderId: order.id, orderNumber: order.orderNumber, razorpay: null as null, fulfilmentType, pickupAt: pickupSlot?.startsAt ?? null };
    }

    if (input.method === "CASH_ON_PICKUP") {
      await tx.payment.create({ data: { orderId: order.id, provider: "cash_on_pickup", method: "CASH_ON_PICKUP", status: "PENDING", amountPaise: quote.totalPaise, idempotencyKey: `cop:${order.id}` } });
      return { orderId: order.id, orderNumber: order.orderNumber, razorpay: null as null, fulfilmentType, pickupAt: pickupSlot?.startsAt ?? null };
    }

    const razorpay = await createRazorpayOrder({
      amountPaise: quote.totalPaise,
      receipt: order.orderNumber,
    });
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "razorpay",
        method: "RAZORPAY",
        status: "PENDING",
        amountPaise: quote.totalPaise,
        providerOrderId: razorpay.providerOrderId,
        idempotencyKey: `rzp:${order.id}`,
        rawStatus: razorpay.mode,
      },
    });
    return { orderId: order.id, orderNumber: order.orderNumber, razorpay, fulfilmentType, pickupAt: pickupSlot?.startsAt ?? null };
  });
}

export async function confirmPaidOrder(orderId: string, tx?: Prisma.TransactionClient) {
  const commit = async (client: Prisma.TransactionClient) => {
    const order = await client.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new Error("Order not found");
    if (order.paymentStatus === "PAID") return false;
    const claim = await client.order.updateMany({
      where: { id: orderId, paymentStatus: { not: "PAID" }, fulfilmentStatus: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] } },
      data: { paymentStatus: "PAID", fulfilmentStatus: "CONFIRMED" },
    });
    if (claim.count === 0) throw new Error("This order can no longer be confirmed as paid.");
    for (const item of order.items) if (item.variantId) await commitReservation(client, item.variantId, item.quantity, order.id);
    await client.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: order.fulfilmentStatus, toStatus: "CONFIRMED", note: "Payment verified" } });
    return true;
  };
  return tx ? commit(tx) : prisma.$transaction(commit);
}
export async function failPendingOrder(orderId: string, tx?: Prisma.TransactionClient) {
  const release = async (client: Prisma.TransactionClient) => {
    const order = await client.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.paymentStatus === "PAID") return false;
    const claim = await client.order.updateMany({ where: { id: order.id, paymentStatus: { not: "PAID" }, fulfilmentStatus: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] } }, data: { paymentStatus: "FAILED", fulfilmentStatus: "CANCELLED" } });
    if (claim.count === 0) return false;
    for (const item of order.items) if (item.variantId) await releaseReservation(client, item.variantId, item.quantity, order.id);
    const fulfilment = await client.orderFulfilment.findUnique({ where: { orderId: order.id } });
    if (fulfilment?.pickupSlotId) await client.appointmentSlot.updateMany({ where: { id: fulfilment.pickupSlotId, reservedCount: { gt: 0 } }, data: { reservedCount: { decrement: 1 } } });
    if (fulfilment) await client.pickupReminder.updateMany({ where: { fulfilmentId: fulfilment.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Order payment failed" } });
    await client.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: order.fulfilmentStatus, toStatus: "CANCELLED", note: "Payment failed" } });
    return true;
  };
  return tx ? release(tx) : prisma.$transaction(release);
}
