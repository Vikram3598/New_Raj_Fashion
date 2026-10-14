import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  try { await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const [orders, staff] = await Promise.all([
    prisma.order.findMany({ where: { fulfilment: { type: "STORE_PICKUP" } }, include: { user: { select: { username: true, identities: { where: { type: "PHONE", verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } } }, items: true, payments: { select: { method: true, status: true } }, fulfilment: { select: { id: true, status: true, pickupSlotId: true, assignedStaffId: true, pickedUpAt: true, createdAt: true, updatedAt: true, pickupSlot: true, assignedStaff: { select: { id: true, username: true } }, history: { orderBy: { createdAt: "desc" }, take: 10 } } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.user.findMany({ where: { status: "ACTIVE", staffProfile: { status: "ACTIVE" }, roles: { some: { role: { name: "STAFF" } } } }, select: { id: true, username: true }, orderBy: { username: "asc" } }),
  ]);
  return NextResponse.json({ orders, staff });
}
