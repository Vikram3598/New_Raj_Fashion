import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ bannerId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { bannerId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid banner status." }, { status: 400 });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.promotionBanner.updateMany({ where: { id: bannerId }, data: { enabled: parsed.data.enabled } });
    if (!result.count) return false;
    await tx.auditLog.create({ data: { actorId: actor.id, action: "banner.status.update", entityType: "PromotionBanner", entityId: bannerId, metadata: { enabled: parsed.data.enabled } } });
    return true;
  });
  if (!updated) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
