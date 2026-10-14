import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

const addSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
});

async function getOrCreateCart(userId: string) {
  const existing = await prisma.cart.findFirst({ where: { userId } });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId } });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const body = addSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const cart = await getOrCreateCart(user.id);
  try {
    await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({ where: { id: body.data.variantId }, include: { product: true } });
      if (!variant || !variant.isActive || variant.product.status !== "PUBLISHED") throw new Error("This variant cannot be purchased.");
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } } });
      const quantity = (existing?.quantity ?? 0) + body.data.quantity;
      const available = variant.stockOnHand - variant.stockReserved;
      if (quantity > 20 || quantity > available) throw new Error("Requested quantity is not available.");
      if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity } });
      else await tx.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "This item could not be added." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().min(0).max(20),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  const item = await prisma.cartItem.findFirst({
    where: { id: body.data.itemId, cart: { userId: user.id } },
    include: { variant: true },
  });
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (body.data.quantity === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
  } else {
    const available = item.variant.stockOnHand - item.variant.stockReserved;
    if (body.data.quantity > available) return NextResponse.json({ error: "Requested quantity is not available." }, { status: 400 });
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: body.data.quantity } });
  }
  return NextResponse.json({ ok: true });
}
