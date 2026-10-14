import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  try { await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const [visits, staff] = await Promise.all([
    prisma.storeVisit.findMany({ include: { customer: { select: { id: true, username: true } }, assignedStaff: { select: { id: true, username: true } }, slot: true, items: true, tasks: true, history: { orderBy: { createdAt: "desc" }, take: 10 } }, orderBy: { slot: { startsAt: "asc" } }, take: 300 }),
    prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { name: "STAFF" } } }, staffProfile: { status: "ACTIVE" } }, select: { id: true, username: true }, orderBy: { username: "asc" } }),
  ]);
  return NextResponse.json({ visits, staff });
}
