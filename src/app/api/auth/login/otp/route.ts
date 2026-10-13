import { NextResponse } from "next/server";
import { z } from "zod";
import { IdentityType } from "@prisma/client";
import { findUsersByIdentity, verifyOtp } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";
import { normalizeEmail, normalizePhone, normalizeUsername } from "@/lib/normalize";
import { prisma } from "@/lib/db";

const schema = z.object({
  channel: z.enum(["EMAIL", "PHONE"]),
  destination: z.string(),
  challengeId: z.string(),
  code: z.string(),
  accountHint: z.string().optional(),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Unable to sign in." }, { status: 400 });
  const destination =
    body.data.channel === "EMAIL" ? normalizeEmail(body.data.destination) : normalizePhone(body.data.destination);
  try {
    await verifyOtp({
      challengeId: body.data.challengeId,
      code: body.data.code,
      destination,
      purpose: "LOGIN",
    });
  } catch {
    return NextResponse.json({ error: "Unable to sign in." }, { status: 401 });
  }
  const matches = await findUsersByIdentity(body.data.channel as IdentityType, destination);
  if (matches.length === 0) {
    return NextResponse.json({ error: "Unable to sign in." }, { status: 401 });
  }
  if (matches.length > 1) {
    if (!body.data.accountHint) {
      return NextResponse.json({
        needsAccountHint: true,
        message: "Enter the username or customer ID for the account you want to open.",
      });
    }
    const hint = body.data.accountHint.trim();
    const chosen = matches.find(
      (m) => m.username === normalizeUsername(hint) || m.customerCode.toLowerCase() === hint.toLowerCase(),
    );
    if (!chosen) return NextResponse.json({ error: "Unable to sign in." }, { status: 401 });
    const totp = await prisma.totpAuthenticator.findUnique({ where: { userId: chosen.id } });
    await createSession(chosen.id, { mfaSatisfied: !totp?.enabledAt });
    return NextResponse.json({ ok: true, mfaRequired: Boolean(totp?.enabledAt) });
  }
  const totp = await prisma.totpAuthenticator.findUnique({ where: { userId: matches[0].id } });
  await createSession(matches[0].id, { mfaSatisfied: !totp?.enabledAt });
  return NextResponse.json({ ok: true, mfaRequired: Boolean(totp?.enabledAt) });
}
