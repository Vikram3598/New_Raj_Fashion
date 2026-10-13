import { NextResponse } from "next/server";
import { ProductStatus } from "@prisma/client";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
const schema = z.object({ status: z.nativeEnum(ProductStatus).optional(), name: z.string().trim().min(2).max(160).optional(), slug: z.string().trim().min(2).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), description: z.string().trim().min(1).max(10000).optional(), categoryId: z.string().nullable().optional(), brand: z.string().max(120).nullable().optional(), fabric: z.string().max(120).nullable().optional(), material: z.string().max(120).nullable().optional(), gender: z.string().max(80).nullable().optional(), occasion: z.string().max(120).nullable().optional(), careInstructions: z.string().max(2000).nullable().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(30).optional() });
export async function PATCH(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  let actor; try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { productId } = await params; const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Invalid product update." }, { status: 400 });
  try {
    const product = await prisma.$transaction(async tx => {
      const updated = await tx.product.update({ where: { id: productId }, data: parsed.data });
      await tx.productChange.create({ data: { productId, actorId: actor.id, summary: "Product details updated", payload: parsed.data } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "product.update", entityType: "Product", entityId: productId } }); return updated;
    });
    return NextResponse.json({ productId: product.id, status: product.status });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (error instanceof Error && "code" in error && error.code === "P2002") return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });
    return NextResponse.json({ error: "Product could not be updated." }, { status: 400 });
  }
}