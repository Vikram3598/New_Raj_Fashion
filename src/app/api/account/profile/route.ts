import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { profileSchema } from "@/lib/account/validation";

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a name up to 120 characters." }, { status: 400 });
  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, fullName: parsed.data.fullName },
    update: { fullName: parsed.data.fullName },
    select: { fullName: true },
  });
  return NextResponse.json({ profile });
}
