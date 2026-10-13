import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(300).optional().nullable(),
  imageUrl: z.string().trim().url().max(2000).optional().nullable().refine((value) => !value || /^https:\/\//i.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(value), "Image must use HTTPS or a local development URL."),
  href: z.string().trim().max(500).optional().nullable().refine((value) => !value || (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) || /^https:\/\//i.test(value), "Link must be an internal site path or HTTPS URL."),
  slot: z.enum(["hero", "new-arrivals", "wedding-season", "festive", "mens-fashion", "womens-fashion", "kids-fashion", "sarees", "suiting" ]),
  sortOrder: z.number().int().min(0).max(10000),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) context.addIssue({ code: "custom", message: "The end date must be after the start date." });
});

export async function POST(req: Request) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid banner." }, { status: 400 });
  const data = parsed.data;
  const banner = await prisma.$transaction(async (tx) => {
    const created = await tx.promotionBanner.create({ data: { ...data, subtitle: data.subtitle || null, imageUrl: data.imageUrl || null, href: data.href || null, startsAt: data.startsAt ? new Date(data.startsAt) : null, endsAt: data.endsAt ? new Date(data.endsAt) : null, enabled: true } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "banner.create", entityType: "PromotionBanner", entityId: created.id, metadata: { slot: created.slot } } });
    return created;
  });
  return NextResponse.json({ banner }, { status: 201 });
}
