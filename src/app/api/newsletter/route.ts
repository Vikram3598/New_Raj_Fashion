import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";

const schema = z.object({ email: z.string().email(), consent: z.literal(true) });

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Consent and a valid email are required." }, { status: 400 });
  await prisma.newsletterSubscription.upsert({
    where: { emailNorm: normalizeEmail(body.data.email) },
    update: { consented: true },
    create: { emailNorm: normalizeEmail(body.data.email), consented: true },
  });
  return NextResponse.json({ ok: true });
}
