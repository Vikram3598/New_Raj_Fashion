import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { hmacSha256, randomOtpDigits } from "@/lib/crypto";

export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user || !user.mfaSatisfied) return NextResponse.json({ error: "Please sign in and verify your account." }, { status: 401 });
  const { orderId } = await params;
  try { await assertRateLimit(`pickup-code:${user.id}:${orderId}`, 5, 60 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many pickup code requests. Please try again later." }, { status: 429 }); }
  const code = randomOtpDigits(8);
  const codeHash = hmacSha256(`${orderId}:${code}`);
  try {
    const fulfilment = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, userId: user.id }, include: { fulfilment: true, payments: true } });
      if (!order?.fulfilment || order.fulfilment.type !== "STORE_PICKUP") throw new Error("Store pickup order not found.");
      if (!["READY", "SCHEDULED"].includes(order.fulfilment.status)) throw new Error("The pickup code becomes available when your order is ready.");
      const cashOnPickup = order.payments.some((payment) => payment.method === "CASH_ON_PICKUP");
      if (order.paymentStatus !== "PAID" && !cashOnPickup) throw new Error("Payment must be confirmed before collecting this order.");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const updated = await tx.orderFulfilment.updateMany({ where: { id: order.fulfilment.id, status: { in: ["READY", "SCHEDULED"] } }, data: { pickupCodeHash: codeHash, pickupCodeExpiresAt: expiresAt } });
      if (!updated.count) throw new Error("The pickup status changed. Refresh and try again.");
      return { expiresAt };
    });
    return NextResponse.json({ code, expiresAt: fulfilment.expiresAt });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to issue pickup code." }, { status: 409 }); }
}
