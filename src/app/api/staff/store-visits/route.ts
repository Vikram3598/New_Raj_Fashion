import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  let staff;
  try { staff = await requirePermission(PERMISSIONS.STORE_VISIT_READ); } catch { return NextResponse.json({ error: "Assigned staff access is required." }, { status: 403 }); }
  const visits = await prisma.storeVisit.findMany({
    where: { assignedStaffId: staff.id },
    select: { id: true, reference: true, customerName: true, phone: true, status: true, purpose: true, referenceImageUrl: true, slot: true, items: true, tasks: { orderBy: { key: "asc" } } },
    orderBy: { slot: { startsAt: "asc" } },
    take: 200,
  });
  return NextResponse.json({ visits });
}
