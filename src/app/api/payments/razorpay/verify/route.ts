import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { processRazorpayPayment } from "@/lib/payments/razorpay";
import { notifyCustomerOrder } from "@/lib/notifications/orders";

const schema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  try {
    const result = await processRazorpayPayment({
      providerOrderId: body.data.razorpay_order_id,
      providerPaymentId: body.data.razorpay_payment_id,
      signature: body.data.razorpay_signature,
      eventId: `client-verify:${body.data.razorpay_payment_id}`,
      eventType: "payment.captured",
      userId: user.id,
    });
    if (!result.duplicate && "orderId" in result) await notifyCustomerOrder({ orderId: result.orderId, eventKey: `payment:${body.data.razorpay_payment_id}`, templateKey: "payment.confirmed", subject: "Payment confirmed", message: "Your payment has been verified and your order is confirmed.", respectPreference: false });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  }
}

