import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { placeOrder } from "@/lib/commerce/checkout";
import { notifyCustomerOrder } from "@/lib/notifications/orders";

const schema = z.object({
  addressId: z.string().optional(),
  method: z.enum(["RAZORPAY", "COD", "CASH_ON_PICKUP"]),
  fulfilmentType: z.enum(["DELIVERY", "STORE_PICKUP"]).default("DELIVERY"),
  pickupAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  if (body.data.fulfilmentType === "DELIVERY" && !body.data.addressId) return NextResponse.json({ error: "Choose a delivery address." }, { status: 400 });
  if (body.data.fulfilmentType === "STORE_PICKUP" && !body.data.pickupAt) return NextResponse.json({ error: "Choose an available pickup time." }, { status: 400 });
  if (body.data.fulfilmentType === "STORE_PICKUP" && body.data.method === "COD") return NextResponse.json({ error: "Use the separately enabled Cash on Pickup option." }, { status: 400 });
  const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
  if (!cart) return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  try {
    const result = await placeOrder({
      userId: user.id,
      cartId: cart.id,
      addressId: body.data.addressId,
      method: body.data.method,
      fulfilmentType: body.data.fulfilmentType,
      pickupAt: body.data.pickupAt ? new Date(body.data.pickupAt) : undefined,
    });
    await notifyCustomerOrder({ orderId: result.orderId, eventKey: `order:${result.orderId}:created`, subject: "Order received", message: `We received order ${result.orderNumber}. Online payment remains pending until the provider confirms it. You can view progress in your account.`, respectPreference: false });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 400 });
  }
}
