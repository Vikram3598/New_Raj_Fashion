import { NextResponse } from "next/server";
import { processRazorpayPayment, verifyWebhookSignature } from "@/lib/payments/razorpay";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }
  const payload = JSON.parse(raw) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  const paymentId = payload.payload?.payment?.entity?.id;
  const orderId = payload.payload?.payment?.entity?.order_id;
  if (!paymentId || !orderId) return NextResponse.json({ ok: true });
  try {
    await processRazorpayPayment({
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      eventId: `${payload.event}:${paymentId}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "webhook error" }, { status: 400 });
  }
}
