import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ couponId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { couponId } = await params;
  const parsed = z.object({ active: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid promotion update." }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.updateMany({ where: { id: couponId }, data: { active: parsed.data.active } });
    if (!coupon.count) return false;
    await tx.auditLog.create({ data: { actorId: actor.id, action: "promotion.status.update", entityType: "Coupon", entityId: couponId, metadata: { active: parsed.data.active } } });
    return true;
  });
  if (!result) return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
