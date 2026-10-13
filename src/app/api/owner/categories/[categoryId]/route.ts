import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/session";
import { slugify } from "@/lib/normalize";

const schema = z.object({
  name: z.string().trim().min(2).max(80), slug: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional().nullable(), parentId: z.string().min(1).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000), published: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { categoryId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid category." }, { status: 400 });
  const slug = slugify(parsed.data.slug);
  if (!slug) return NextResponse.json({ error: "Enter a valid category URL name." }, { status: 400 });
  if (parsed.data.parentId === categoryId) return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });
  if (parsed.data.parentId && !await prisma.category.findUnique({ where: { id: parsed.data.parentId }, select: { id: true } })) {
    return NextResponse.json({ error: "Parent category not found." }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true, slug: true } });
      if (!category) return null;
      let parentId = parsed.data.parentId || null;
      const seen = new Set<string>();
      while (parentId) {
        if (parentId === categoryId || seen.has(parentId)) throw new Error("Category hierarchy would contain a cycle.");
        seen.add(parentId);
        const parent = await tx.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
        parentId = parent?.parentId ?? null;
      }
      const updated = await tx.category.update({ where: { id: categoryId }, data: { ...parsed.data, slug, description: parsed.data.description || null, parentId: parsed.data.parentId || null } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "category.update", entityType: "Category", entityId: categoryId, metadata: { fromSlug: category.slug, toSlug: updated.slug, published: updated.published } } });
      return updated;
    });
    if (!result) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ category: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Category could not be updated.";
    return NextResponse.json({ error: message }, { status: message.includes("cycle") ? 400 : 409 });
  }
}
