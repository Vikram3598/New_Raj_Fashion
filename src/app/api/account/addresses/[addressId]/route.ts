import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { addressSchema } from "@/lib/account/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ addressId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const { addressId } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the address details." }, { status: 400 });
  try {
    const address = await prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id: addressId, userId: user.id }, select: { id: true } });
      if (!existing) return null;
      if (parsed.data.isDefault) await tx.address.updateMany({ where: { userId: user.id, id: { not: addressId } }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { ...parsed.data, line2: parsed.data.line2 || null, phone: parsed.data.phone || null, country: "IN" } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!address) return NextResponse.json({ error: "Address not found." }, { status: 404 });
    return NextResponse.json({ address });
  } catch {
    return NextResponse.json({ error: "Unable to save this address. Please try again." }, { status: 409 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ addressId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const { addressId } = await params;
  const address = await prisma.address.findFirst({ where: { id: addressId, userId: user.id }, select: { id: true, isDefault: true, _count: { select: { orders: true } } } });
  if (!address) return NextResponse.json({ error: "Address not found." }, { status: 404 });
  if (address._count.orders > 0) return NextResponse.json({ error: "This address is linked to an order and cannot be deleted." }, { status: 409 });
  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: address.id } });
    if (address.isDefault) {
      const next = await tx.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return NextResponse.json({ ok: true });
}
