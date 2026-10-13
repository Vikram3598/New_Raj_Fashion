import { prisma } from "@/lib/db";

export type QuoteLine = {
  variantId: string;
  quantity: number;
  sku: string;
  productName: string;
  variantTitle: string;
  unitPricePaise: number;
  lineTotalPaise: number;
};

export type OrderQuote = {
  lines: QuoteLine[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  couponCode?: string;
};

export async function quoteCart(cartId: string, couponCode?: string | null): Promise<OrderQuote> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          variant: { include: { product: true } },
        },
      },
    },
  });
  if (!cart) throw new Error("Cart not found.");

  const lines: QuoteLine[] = [];
  for (const item of cart.items) {
    const { variant } = item;
    if (!variant.isActive || variant.product.status !== "PUBLISHED") {
      throw new Error("A product in your cart is no longer available.");
    }
    const available = variant.stockOnHand - variant.stockReserved;
    if (item.quantity > available) {
      throw new Error("A product in your cart does not have enough stock.");
    }
    lines.push({
      variantId: variant.id,
      quantity: item.quantity,
      sku: variant.sku,
      productName: variant.product.name,
      variantTitle: variant.title,
      unitPricePaise: variant.pricePaise,
      lineTotalPaise: variant.pricePaise * item.quantity,
    });
  }

  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  let discountPaise = 0;
  let appliedCode: string | undefined;
  const code = couponCode ?? cart.couponCode;
  if (code) {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    const now = new Date();
    if (
      !coupon ||
      !coupon.active ||
      (coupon.startsAt && coupon.startsAt > now) ||
      (coupon.endsAt && coupon.endsAt < now) ||
      (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) ||
      (coupon.minSubtotalPaise != null && subtotalPaise < coupon.minSubtotalPaise)
    ) {
      throw new Error("This coupon code is not valid.");
    }
    if (coupon.percentOff) {
      discountPaise = Math.floor((subtotalPaise * coupon.percentOff) / 100);
    } else if (coupon.amountOffPaise) {
      discountPaise = Math.min(coupon.amountOffPaise, subtotalPaise);
    }
    appliedCode = coupon.code;
  }

  const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
  const delivery = (settings?.deliveryRules as { feePaise?: number; freeAbovePaise?: number } | null) ?? {};
  let shippingPaise = delivery.feePaise ?? 0;
  if (delivery.freeAbovePaise && subtotalPaise - discountPaise >= delivery.freeAbovePaise) {
    shippingPaise = 0;
  }
  const taxCfg = (settings?.taxConfig as { rateBps?: number } | null) ?? {};
  const taxable = Math.max(0, subtotalPaise - discountPaise);
  const taxPaise = taxCfg.rateBps ? Math.floor((taxable * taxCfg.rateBps) / 10000) : 0;
  const totalPaise = taxable + shippingPaise + taxPaise;

  return {
    lines,
    subtotalPaise,
    discountPaise,
    shippingPaise,
    taxPaise,
    totalPaise,
    couponCode: appliedCode,
  };
}
