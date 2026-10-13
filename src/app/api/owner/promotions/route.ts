import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
  description: z.string().trim().max(240).optional().nullable(),
  percentOff: z.number().int().min(1).max(90).optional().nullable(),
  amountOffRupees: z.number().positive().max(1000000).optional().nullable(),
  minSubtotalRupees: z.number().min(0).max(10000000).optional().nullable(),
  maxUses: z.number().int().min(1).max(10000000).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
}).superRefine((value, context) => {
  if (Boolean(value.percentOff) === Boolean(value.amountOffRupees)) context.addIssue({ code: "custom", message: "Choose either a percentage discount or a fixed amount discount." });
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) context.addIssue({ code: "custom", message: "The end date must be after the start date." });
});

export async function POST(req: Request) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid promotion." }, { status: 400 });
  const data = parsed.data;
  try {
    const coupon = await prisma.$transaction(async (tx) => {
      const created = await tx.coupon.create({ data: {
        code: data.code, description: data.description || null,
        percentOff: data.percentOff ?? null,
        amountOffPaise: data.amountOffRupees ? Math.round(data.amountOffRupees * 100) : null,
        minSubtotalPaise: data.minSubtotalRupees != null ? Math.round(data.minSubtotalRupees * 100) : null,
        maxUses: data.maxUses ?? null, startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null, active: true,
      } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "promotion.create", entityType: "Coupon", entityId: created.id, metadata: { code: created.code } } });
      return created;
    });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That promotion code already exists or could not be saved." }, { status: 409 });
  }
}
