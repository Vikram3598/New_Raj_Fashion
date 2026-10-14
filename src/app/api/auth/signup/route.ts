import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyOtp } from "@/lib/auth/otp";
import { hashPassword, assertPasswordPolicy } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { normalizeEmail, normalizePhone, normalizeUsername } from "@/lib/normalize";
import { randomBytes } from "node:crypto";

const schema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: z.string().min(2).max(80),
  password: z.string().min(10),
  channel: z.enum(["EMAIL", "PHONE"]),
  destination: z.string(),
  challengeId: z.string(),
  code: z.string().min(4).max(8),
});

function customerCode() {
  return `NRF${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
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
      purpose: "SIGNUP",
    });
  } catch {
    return NextResponse.json({ error: "Invalid or expired verification code." }, { status: 400 });
  }

  const username = normalizeUsername(body.data.username);
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return NextResponse.json({ error: "That username is not available." }, { status: 400 });

  const customerRole = await prisma.role.findUnique({ where: { name: "CUSTOMER" } });
  if (!customerRole) return NextResponse.json({ error: "Server is not seeded." }, { status: 500 });

  const user = await prisma.user.create({
    data: {
      username,
      customerCode: customerCode(),
      profile: { create: { fullName: body.data.fullName } },
      password: { create: { hash: await hashPassword(body.data.password) } },
      identities: {
        create: {
          type: body.data.channel,
          valueNormalized: destination,
          verifiedAt: new Date(),
          isPrimary: true,
        },
      },
      roles: { create: { roleId: customerRole.id } },
      communicationPrefs: { create: {} },
    },
  });
  await createSession(user.id, { ip: req.headers.get("x-forwarded-for") ?? undefined, mfaSatisfied: true });
  return NextResponse.json({ ok: true, customerCode: user.customerCode });
}
