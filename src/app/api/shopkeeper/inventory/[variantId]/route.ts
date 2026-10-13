import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";

const schema = z.object({ stockOnHand: z.number().int().min(0).max(100000), note: z.string().trim().min(3).max(300) });

export async function PATCH(request: Request, { params }: { params: Promise<{ variantId: string }> }) {
  let actor;
  try { actor = await requirePermission(PERMISSIONS.INVENTORY_ADJUST); } catch { return NextResponse.json({ error: "You cannot record stock counts." }, { status: 403 }); }
  const { variantId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid count and a reason." }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ stockOnHand: number; stockReserved: number }>>`SELECT "stockOnHand", "stockReserved" FROM "ProductVariant" WHERE id = ${variantId} FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new Error("Variant not found.");
      if (parsed.data.stockOnHand < current.stockReserved) throw new Error("Count cannot be lower than units reserved for open orders.");
      const delta = parsed.data.stockOnHand - current.stockOnHand;
      await tx.productVariant.update({ where: { id: variantId }, data: { stockOnHand: parsed.data.stockOnHand } });
      if (delta !== 0) await tx.inventoryMovement.create({ data: { variantId, deltaOnHand: delta, reason: "staff_stock_count", reference: parsed.data.note, actorId: actor.id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "inventory.staff_count", entityType: "ProductVariant", entityId: variantId, metadata: { oldCount: current.stockOnHand, newCount: parsed.data.stockOnHand } } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Stock count could not be saved." }, { status: 400 }); }
}
