import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { normalizeUsername } from "@/lib/normalize";
import { assertRateLimit, recordSecurityEvent } from "@/lib/auth/rate-limit";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  try {
    await assertRateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
  } catch {
    return NextResponse.json({ error: "Unable to sign in." }, { status: 429 });
  }
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Unable to sign in." }, { status: 400 });
  const username = normalizeUsername(body.data.username);
  const user = await prisma.user.findUnique({
    where: { username },
    include: { password: true, totp: true },
  });
  const generic = "Unable to sign in.";
  if (!user || user.status !== "ACTIVE" || !user.password) {
    await recordSecurityEvent({ type: "login_failed", ipAddress: ip, detail: { reason: "unknown_user" } });
    return NextResponse.json({ error: generic }, { status: 401 });
  }
  const ok = await verifyPassword(user.password.hash, body.data.password);
  if (!ok) {
    await recordSecurityEvent({ type: "login_failed", ipAddress: ip, userId: user.id });
    return NextResponse.json({ error: generic }, { status: 401 });
  }
  const mfaEnabled = Boolean(user.totp?.enabledAt);
  await createSession(user.id, { ip, mfaSatisfied: !mfaEnabled });
  return NextResponse.json({ ok: true, mfaRequired: mfaEnabled });
}
