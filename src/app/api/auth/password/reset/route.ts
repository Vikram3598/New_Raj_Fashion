import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyOtp } from "@/lib/auth/otp";
import { assertPasswordPolicy, hashPassword } from "@/lib/auth/password";
import { normalizeEmail, normalizePhone, normalizeUsername } from "@/lib/normalize";
import { revokeAllSessions } from "@/lib/auth/session";

const schema = z.object({
  channel: z.enum(["EMAIL", "PHONE"]),
  destination: z.string(),
  challengeId: z.string(),
  code: z.string(),
  username: z.string(),
  password: z.string(),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Unable to reset password." }, { status: 400 });
  try {
    assertPasswordPolicy(body.data.password);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid password" }, { status: 400 });
  }
  const destination =
    body.data.channel === "EMAIL" ? normalizeEmail(body.data.destination) : normalizePhone(body.data.destination);
  try {
    await verifyOtp({
      challengeId: body.data.challengeId,
      code: body.data.code,
      destination,
      purpose: "RESET_PASSWORD",
    });
  } catch {
    return NextResponse.json({ error: "Unable to reset password." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(body.data.username) },
    include: { identities: true },
  });
  const owns = user?.identities.some((i) => i.type === body.data.channel && i.valueNormalized === destination && i.verifiedAt);
  if (!user || !owns) return NextResponse.json({ error: "Unable to reset password." }, { status: 400 });
  await prisma.passwordCredential.upsert({
    where: { userId: user.id },
    update: { hash: await hashPassword(body.data.password), passwordSetAt: new Date() },
    create: { userId: user.id, hash: await hashPassword(body.data.password) },
  });
  await revokeAllSessions(user.id);
  return NextResponse.json({ ok: true });
}
