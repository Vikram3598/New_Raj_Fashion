import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { randomOtpDigits, hmacSha256 } from "@/lib/crypto";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { getSessionUser } from "@/lib/auth/session";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { prisma } from "@/lib/db";
import { sendEmail, sendSms } from "@/lib/notifications/providers";

export const runtime = "nodejs";
const schema = z.object({ phone: z.string().trim().min(7).max(20), email: z.string().trim().email().max(254).optional().or(z.literal("")) });

export async function POST(request: Request) {
  if (await getSessionUser()) return NextResponse.json({ error: "Signed-in customers do not need guest verification." }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid phone number and, if available, email." }, { status: 400 });
  const channel = parsed.data.email ? "EMAIL" : "SMS";
  const contact = channel === "EMAIL" ? normalizeEmail(parsed.data.email!) : normalizePhone(parsed.data.phone);
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await assertRateLimit(`store-visit-verify:${contact}`, 5, 60 * 60 * 1000);
    await assertRateLimit(`store-visit-verify-ip:${ipAddress}`, 20, 60 * 60 * 1000);
  } catch { return NextResponse.json({ error: "Too many verification requests. Please try again later." }, { status: 429 }); }

  const id = randomUUID();
  const code = randomOtpDigits(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  try {
    await prisma.storeVisitVerification.create({ data: { id, contact, channel, codeHash: hmacSha256(`store-visit:${id}:${code}`), expiresAt, ipAddress } });
    let delivery: { status?: string } | null = null;
    const devCodeEnabled = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_OTP_ENABLED === "true";
    if (!devCodeEnabled) {
      delivery = channel === "EMAIL"
        ? await sendEmail({ to: contact, subject: "Your store visit verification code", text: `Your New Raj Fashion store visit code is ${code}. It expires in 10 minutes.`, templateKey: "store-visit.guest-otp", idempotencyKey: `store-visit:guest-otp:${id}` })
        : await sendSms({ to: contact, text: `Your New Raj Fashion store visit code is ${code}. It expires in 10 minutes.`, templateKey: "store-visit.guest-otp", idempotencyKey: `store-visit:guest-otp:${id}` });
      if (delivery.status !== "SENT") {
        await prisma.storeVisitVerification.delete({ where: { id } });
        return NextResponse.json({ error: `Guest verification delivery is unavailable. Configure ${channel === "EMAIL" ? "SMTP email" : "Twilio SMS"}, or sign in to submit a store visit.` }, { status: 503 });
      }
    }
    return NextResponse.json({ verificationId: id, expiresAt, ...(devCodeEnabled ? { devCode: code } : {}), channel });
  } catch {
    await prisma.storeVisitVerification.deleteMany({ where: { id } }).catch(() => undefined);
    return NextResponse.json({ error: "Could not send a verification code. Try again later." }, { status: 503 });
  }
}
