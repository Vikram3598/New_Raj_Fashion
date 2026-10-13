import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({
  orderId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(10).max(2000),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a rating and a review of at least 10 characters." }, { status: 400 });
  const { orderId, productId, rating, title, body } = parsed.data;
  const eligible = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id, fulfilmentStatus: "DELIVERED", items: { some: { variant: { productId } } } },
    select: { id: true },
  });
  if (!eligible) return NextResponse.json({ error: "A delivered order containing this product is required." }, { status: 403 });
  try {
    const review = await prisma.productReview.create({ data: { productId, userId: user.id, orderId, rating, title: title || null, body, published: false } });
    await prisma.auditLog.create({ data: { actorId: user.id, action: "product.review.submit", entityType: "ProductReview", entityId: review.id } });
    return NextResponse.json({ ok: true, pendingModeration: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") return NextResponse.json({ error: "You have already reviewed this product." }, { status: 409 });
    return NextResponse.json({ error: "Your review could not be submitted." }, { status: 400 });
  }
}
