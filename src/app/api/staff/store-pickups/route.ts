import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  let staff;
  try { staff = await requirePermission(PERMISSIONS.PICKUP_READ); } catch { return NextResponse.json({ error: "Assigned staff access is required." }, { status: 403 }); }
  const orders = await prisma.order.findMany({
    where: { fulfilment: { type: "STORE_PICKUP", assignedStaffId: staff.id } },
    select: {
      id: true, orderNumber: true, paymentStatus: true,
      user: { select: { username: true, identities: { where: { type: "PHONE", verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { valueNormalized: true } } } },
      items: { select: { id: true, productName: true, variantTitle: true, quantity: true } },
      payments: { select: { method: true, status: true } },
      fulfilment: { select: { status: true, pickupSlot: { select: { startsAt: true } } } },
    },
    orderBy: { fulfilment: { pickupSlot: { startsAt: "asc" } } },
    take: 200,
  });
  return NextResponse.json({ orders });
}
