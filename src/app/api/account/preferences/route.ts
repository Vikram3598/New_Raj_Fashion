import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({ emailOffers: z.boolean(), smsOffers: z.boolean(), orderUpdates: z.boolean() });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const preferences = await prisma.communicationPreference.upsert({
    where: { userId: user.id }, create: { userId: user.id }, update: {},
    select: { emailOffers: true, smsOffers: true, orderUpdates: true },
  });
  return NextResponse.json({ preferences });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose valid communication preferences." }, { status: 400 });
  const preferences = await prisma.$transaction(async (tx) => {
    const saved = await tx.communicationPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...parsed.data }, update: parsed.data, select: { emailOffers: true, smsOffers: true, orderUpdates: true } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "account.communication_preferences.update", entityType: "CommunicationPreference", entityId: user.id } });
    return saved;
  });
  return NextResponse.json({ preferences });
}
