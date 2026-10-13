import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { quoteCart } from "@/lib/commerce/pricing";
import { commitReservation, releaseReservation, reserveStock } from "@/lib/commerce/inventory";
import { createRazorpayOrder } from "@/lib/payments/razorpay";

function orderNumber() {
  const y = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "2-digit" });
  return `NRF${y}${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function placeOrder(input: {
  userId: string;
  cartId: string;
  addressId: string;
  method: "RAZORPAY" | "COD";
}) {
  return prisma.$transaction(async (tx) => {
    const address = await tx.address.findFirst({
      where: { id: input.addressId, userId: input.userId },
    });
    if (!address) throw new Error("Please select a valid delivery address.");

    const quote = await quoteCart(input.cartId);
    const settings = await tx.storeSettings.findUnique({ where: { id: "store" } });
    const payCfg = (settings?.paymentConfig as { codEnabled?: boolean } | null) ?? {};
    if (input.method === "COD" && !payCfg.codEnabled) {
      throw new Error("Cash on Delivery is not enabled.");
    }

    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        userId: input.userId,
        addressId: address.id,
        fulfilmentStatus: "PENDING_CONFIRMATION",
        paymentStatus: input.method === "COD" ? "PENDING" : "PENDING",
        couponCodeSnapshot: quote.couponCode,
        subtotalPaise: quote.subtotalPaise,
        discountPaise: quote.discountPaise,
        shippingPaise: quote.shippingPaise,
        taxPaise: quote.taxPaise,
        totalPaise: quote.totalPaise,
        shippingSnapshot: {
          recipient: address.recipient,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          phone: address.phone,
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
        statusHistory: { create: { toStatus: "PENDING_CONFIRMATION", note: "Order created" } },
      },
    });

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
      return { orderId: order.id, orderNumber: order.orderNumber, razorpay: null as null };
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
    return { orderId: order.id, orderNumber: order.orderNumber, razorpay };
  });
}

export async function confirmPaidOrder(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    if (!order) throw new Error("Order not found");
    if (order.paymentStatus === "PAID") return;
    for (const item of order.items) {
      if (item.variantId) {
        await commitReservation(tx, item.variantId, item.quantity, order.id);
      }
    }
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "PAID", fulfilmentStatus: "CONFIRMED" },
    });
    await tx.orderStatusEvent.create({
      data: { orderId: order.id, fromStatus: order.fulfilmentStatus, toStatus: "CONFIRMED", note: "Payment verified" },
    });
  });
}

export async function failPendingOrder(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.paymentStatus === "PAID") return;
    for (const item of order.items) {
      if (item.variantId) await releaseReservation(tx, item.variantId, item.quantity, order.id);
    }
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "FAILED", fulfilmentStatus: "CANCELLED" },
    });
  });
}
