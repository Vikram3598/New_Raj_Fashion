import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { beginTotpEnrollment, verifyAndEnableTotp, verifyUserTotp } from "@/lib/auth/totp";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { markMfaSatisfied, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const verifySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST() {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Sign in to manage authenticator settings." }, { status: 401 }); }
  if (user.mfaEnabled) return NextResponse.json({ error: "Authenticator is already enabled." }, { status: 409 });
  try { await assertRateLimit(`mfa-setup:${user.id}`, 5, 60 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many setup attempts. Try again later." }, { status: 429 }); }
  const enrollment = await beginTotpEnrollment(user.id, user.username);
  const qrCodeDataUrl = await QRCode.toDataURL(enrollment.otpauth, { errorCorrectionLevel: "M", margin: 2, width: 240 });
  return NextResponse.json({ secret: enrollment.secret, qrCodeDataUrl });
}

export async function PATCH(request: Request) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Sign in to manage authenticator settings." }, { status: 401 }); }
  if (user.mfaEnabled) return NextResponse.json({ error: "Authenticator is already enabled." }, { status: 409 });
  try { await assertRateLimit(`mfa-setup-verify:${user.id}`, 8, 15 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 }); }
  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the six-digit code from your authenticator app." }, { status: 400 });
  try {
    const recoveryCodes = await verifyAndEnableTotp(user.id, parsed.data.code);
    await markMfaSatisfied();
    await prisma.auditLog.create({ data: { actorId: user.id, action: "account.mfa.enable", entityType: "User", entityId: user.id } });
    return NextResponse.json({ ok: true, recoveryCodes });
  } catch {
    return NextResponse.json({ error: "The code did not match. Check the time on your device and try again." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 401 }); }
  if (!user.mfaEnabled) return NextResponse.json({ error: "Authenticator is not enabled." }, { status: 409 });
  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your current authenticator code to disable MFA." }, { status: 400 });
  try { await assertRateLimit(`mfa-disable:${user.id}`, 5, 15 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 }); }
  if (!await verifyUserTotp(user.id, parsed.data.code).catch(() => false)) return NextResponse.json({ error: "The code did not match." }, { status: 401 });
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.totpAuthenticator.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({ data: { actorId: user.id, action: "account.mfa.disable", entityType: "User", entityId: user.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
