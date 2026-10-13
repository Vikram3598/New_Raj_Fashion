import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { quoteCart } from "@/lib/commerce/pricing";

const schema = z.object({ code: z.string().trim().min(1).max(40) });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
  const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
  if (!cart) return NextResponse.json({ error: "Your cart is empty." }, { status: 404 });
  const code = parsed.data.code.toUpperCase();
  try { await quoteCart(cart.id, code); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "This coupon code is not valid." }, { status: 400 }); }
  await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
  if (!cart) return NextResponse.json({ error: "Your cart is empty." }, { status: 404 });
  await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  return NextResponse.json({ ok: true });
}
