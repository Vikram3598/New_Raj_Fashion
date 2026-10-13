import { NextResponse } from "next/server";
import { ProductStatus } from "@prisma/client";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const variantSchema = z.object({
  sku: z.string().trim().min(2).max(64), title: z.string().trim().min(1).max(100),
  priceRupees: z.number().positive().max(10000000), mrpRupees: z.number().positive().max(10000000).optional().nullable(), costRupees: z.number().positive().max(10000000).optional().nullable(),
  stockOnHand: z.number().int().min(0).max(100000), size: z.string().max(40).optional().nullable(), colour: z.string().max(60).optional().nullable(),
});
const productSchema = z.object({
  sku: z.string().trim().min(2).max(64), name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().trim().min(1).max(10000),
  categoryId: z.string().optional().nullable(), brand: z.string().max(120).optional().nullable(), fabric: z.string().max(120).optional().nullable(),
  material: z.string().max(120).optional().nullable(), gender: z.string().max(80).optional().nullable(), occasion: z.string().max(120).optional().nullable(),
  careInstructions: z.string().max(2000).optional().nullable(), tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  status: z.nativeEnum(ProductStatus).default("DRAFT"), variants: z.array(variantSchema).min(1).max(100),
});
export async function POST(req: Request) {
  let actor; try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const parsed = productSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the product details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data;
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: {
        sku: input.sku, name: input.name, slug: input.slug, description: input.description, categoryId: input.categoryId || null,
        brand: input.brand || null, fabric: input.fabric || null, material: input.material || null, gender: input.gender || null,
        occasion: input.occasion || null, careInstructions: input.careInstructions || null, tags: input.tags, status: input.status,
        variants: { create: input.variants.map(v => ({ sku: v.sku, title: v.title, pricePaise: Math.round(v.priceRupees*100), mrpPaise: v.mrpRupees ? Math.round(v.mrpRupees*100) : null, costPaise: v.costRupees ? Math.round(v.costRupees*100) : null, stockOnHand: v.stockOnHand, size: v.size || null, colour: v.colour || null })) },
      }, include: { variants: true } });
      for (const v of created.variants) if (v.stockOnHand > 0) await tx.inventoryMovement.create({ data: { variantId: v.id, deltaOnHand: v.stockOnHand, reason: "initial_stock", reference: created.id, actorId: actor.id } });
      await tx.productChange.create({ data: { productId: created.id, actorId: actor.id, summary: "Product created", payload: { sku: created.sku, name: created.name, status: created.status } } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "product.create", entityType: "Product", entityId: created.id } });
      return created;
    });
    return NextResponse.json({ productId: product.id }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Error && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "That product or variant SKU/slug is already in use." : "Product could not be saved." }, { status: 400 });
  }
}
