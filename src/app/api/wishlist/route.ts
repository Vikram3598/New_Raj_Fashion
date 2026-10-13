import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

const schema = z.object({ variantId: z.string(), quantity: z.number().optional() });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
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
