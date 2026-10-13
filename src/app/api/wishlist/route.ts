import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

const schema = z.object({ variantId: z.string(), quantity: z.number().optional() });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const wishlist = await prisma.wishlist.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  await prisma.wishlistItem.upsert({
    where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId: body.data.variantId } },
    update: {},
    create: { wishlistId: wishlist.id, variantId: body.data.variantId },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = z.object({ variantId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const wishlist = await prisma.wishlist.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!wishlist) return NextResponse.json({ error: "Wishlist item not found." }, { status: 404 });
  const deleted = await prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, variantId: parsed.data.variantId } });
  if (!deleted.count) return NextResponse.json({ error: "Wishlist item not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
