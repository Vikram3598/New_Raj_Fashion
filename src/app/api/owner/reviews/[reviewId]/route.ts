import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({ published: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { reviewId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose whether to publish this review." }, { status: 400 });
  const review = await prisma.productReview.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.productReview.update({ where: { id: reviewId }, data: { published: parsed.data.published } }),
    prisma.auditLog.create({ data: { actorId: actor.id, action: parsed.data.published ? "product.review.publish" : "product.review.reject", entityType: "ProductReview", entityId: reviewId } }),
  ]);
  return NextResponse.json({ ok: true });
}
