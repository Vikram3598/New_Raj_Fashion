import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/session";
import { slugify } from "@/lib/normalize";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  parentId: z.string().min(1).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  published: z.boolean().default(false),
});

export async function POST(req: Request) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid category." }, { status: 400 });
  const slug = slugify(parsed.data.slug);
  if (!slug) return NextResponse.json({ error: "Enter a valid category URL name." }, { status: 400 });
  if (parsed.data.parentId && !await prisma.category.findUnique({ where: { id: parsed.data.parentId }, select: { id: true } })) {
    return NextResponse.json({ error: "Parent category not found." }, { status: 400 });
  }
  try {
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({ data: { ...parsed.data, slug, description: parsed.data.description || null, parentId: parsed.data.parentId || null } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "category.create", entityType: "Category", entityId: created.id, metadata: { slug: created.slug } } });
      return created;
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That category URL is already in use or the category could not be saved." }, { status: 409 });
  }
}
