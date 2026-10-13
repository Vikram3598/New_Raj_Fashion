import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { addressSchema } from "@/lib/account/validation";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the address details." }, { status: 400 });
  try {
    const address = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      const hasAddress = await tx.address.count({ where: { userId: user.id } });
      return tx.address.create({ data: { label: parsed.data.label, recipient: parsed.data.recipient, line1: parsed.data.line1, line2: parsed.data.line2 || null, city: parsed.data.city, state: parsed.data.state, postalCode: parsed.data.postalCode, phone: parsed.data.phone || null, country: "IN", isDefault: parsed.data.isDefault || hasAddress === 0, user: { connect: { id: user.id } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ address }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save this address. Please try again." }, { status: 409 });
  }
}
