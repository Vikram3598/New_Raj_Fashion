import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
const schema = z.object({ priceRupees: z.number().positive().max(10000000).optional(), mrpRupees: z.number().positive().max(10000000).nullable().optional(), costRupees: z.number().positive().max(10000000).nullable().optional(), stockOnHand: z.number().int().min(0).max(100000).optional(), active: z.boolean().optional() });
export async function PATCH(req: Request, { params }: { params: Promise<{ variantId: string }> }) {
  let actor; try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { variantId } = await params; const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Invalid variant update." }, { status: 400 });
  try {
    const updated = await prisma.$transaction(async tx => {
      const current = await tx.productVariant.findUnique({ where: { id: variantId } }); if (!current) return null;
      const nextStock = parsed.data.stockOnHand ?? current.stockOnHand; if (nextStock < current.stockReserved) throw new Error("Stock cannot be set below the quantity reserved for orders.");
      const variant = await tx.productVariant.update({ where: { id: variantId }, data: { ...(parsed.data.priceRupees !== undefined ? { pricePaise: Math.round(parsed.data.priceRupees*100) } : {}), ...(parsed.data.mrpRupees !== undefined ? { mrpPaise: parsed.data.mrpRupees === null ? null : Math.round(parsed.data.mrpRupees*100) } : {}), ...(parsed.data.costRupees !== undefined ? { costPaise: parsed.data.costRupees === null ? null : Math.round(parsed.data.costRupees*100) } : {}), ...(parsed.data.stockOnHand !== undefined ? { stockOnHand: nextStock } : {}), ...(parsed.data.active !== undefined ? { isActive: parsed.data.active } : {}) } });
      if (parsed.data.stockOnHand !== undefined && nextStock !== current.stockOnHand) await tx.inventoryMovement.create({ data: { variantId, deltaOnHand: nextStock-current.stockOnHand, reason: "owner_adjustment", actorId: actor.id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "variant.update", entityType: "ProductVariant", entityId: variantId, metadata: { changes: Object.keys(parsed.data) } } }); return variant;
    });
    if (!updated) return NextResponse.json({ error: "Variant not found." }, { status: 404 }); return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Variant could not be updated." }, { status: 400 }); }
}
