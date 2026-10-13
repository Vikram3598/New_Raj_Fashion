import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { placeOrder } from "@/lib/commerce/checkout";

const schema = z.object({
  addressId: z.string(),
  method: z.enum(["RAZORPAY", "COD"]),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
  if (!cart) return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  try {
    const result = await placeOrder({
      userId: user.id,
      cartId: cart.id,
      addressId: body.data.addressId,
      method: body.data.method,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 400 });
  }
}
