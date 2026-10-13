import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { processRazorpayPayment } from "@/lib/payments/razorpay";

const schema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  try {
    const result = await processRazorpayPayment({
      providerOrderId: body.data.razorpay_order_id,
      providerPaymentId: body.data.razorpay_payment_id,
      signature: body.data.razorpay_signature,
      eventId: `client-verify:${body.data.razorpay_payment_id}`,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  }
}
