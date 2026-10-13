import { prisma } from "@/lib/db";

export type QuoteLine = {
  variantId: string;
  quantity: number;
  sku: string;
  productName: string;
  variantTitle: string;
  unitPricePaise: number;
  discountPaise: number;
  taxPaise: number;
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

export function allocateProportionally(amount: number, weights: number[]) {
  if (!Number.isSafeInteger(amount) || amount < 0 || weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) throw new Error("Allocation values must be non-negative integer paise.");
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (amount === 0 || totalWeight === 0) return weights.map(() => 0);
  const denominator = BigInt(totalWeight);
  const allocated = weights.map((weight) => Number((BigInt(amount) * BigInt(weight)) / denominator));
  let remainder = amount - allocated.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % weights.length) {
    if (weights[index] > 0) { allocated[index]++; remainder--; }
  }
  return allocated;
}

export async function quoteCart(cartId: string, couponCode?: string | null, postalCode?: string): Promise<OrderQuote> {
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
  if (cart.items.length === 0) throw new Error("Your cart is empty.");

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
      discountPaise: 0,
      taxPaise: 0,
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
  const allowedPostalCodes = (delivery as { allowedPostalCodes?: string[] }).allowedPostalCodes;
  if (postalCode && allowedPostalCodes?.length && !allowedPostalCodes.includes(postalCode)) throw new Error("Delivery is not available at the selected postal code.");
  let shippingPaise = delivery.feePaise ?? 0;
  if (delivery.freeAbovePaise && subtotalPaise - discountPaise >= delivery.freeAbovePaise) {
    shippingPaise = 0;
  }
  const taxCfg = (settings?.taxConfig as { rateBps?: number } | null) ?? {};
  const taxable = Math.max(0, subtotalPaise - discountPaise);
  const taxPaise = taxCfg.rateBps ? Math.floor((taxable * taxCfg.rateBps) / 10000) : 0;
  const totalPaise = taxable + shippingPaise + taxPaise;
  const discounts = allocateProportionally(discountPaise, lines.map((line) => line.lineTotalPaise));
  const taxes = allocateProportionally(taxPaise, lines.map((line, index) => line.lineTotalPaise - discounts[index]));
  const snapshotLines = lines.map((line, index) => ({ ...line, discountPaise: discounts[index], taxPaise: taxes[index], lineTotalPaise: line.lineTotalPaise - discounts[index] + taxes[index] }));

  return {
    lines: snapshotLines,
    subtotalPaise,
    discountPaise,
    shippingPaise,
    taxPaise,
    totalPaise,
    couponCode: appliedCode,
  };
}
