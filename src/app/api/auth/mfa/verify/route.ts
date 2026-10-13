import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRecoveryCode, verifyUserTotp } from "@/lib/auth/totp";
import { assertRateLimit, recordSecurityEvent } from "@/lib/auth/rate-limit";
import { getSessionUser, markMfaSatisfied } from "@/lib/auth/session";

const schema = z.object({ code: z.string().trim().min(6).max(32) });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!user.mfaEnabled) return NextResponse.json({ error: "Authenticator verification is not enabled." }, { status: 400 });
  if (user.mfaSatisfied) return NextResponse.json({ ok: true });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid authenticator or recovery code." }, { status: 400 });
  try { await assertRateLimit(`mfa-verify:${user.id}`, 8, 15 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 }); }
  let valid = false;
  if (/^\d{6}$/.test(parsed.data.code)) valid = await verifyUserTotp(user.id, parsed.data.code).catch(() => false);
  else valid = await consumeRecoveryCode(user.id, parsed.data.code).catch(() => false);
  if (!valid) {
    await recordSecurityEvent({ type: "mfa_failed", userId: user.id, ipAddress: request.headers.get("x-forwarded-for") ?? undefined });
    return NextResponse.json({ error: "The code is invalid or expired." }, { status: 401 });
  }
  await markMfaSatisfied();
  await recordSecurityEvent({ type: "mfa_succeeded", userId: user.id, ipAddress: request.headers.get("x-forwarded-for") ?? undefined });
  return NextResponse.json({ ok: true });
}
