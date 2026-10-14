import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { dateTimeInStoreZone } from "@/lib/store-slots";

export async function GET(request: Request) {
  try { await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const url = new URL(request.url);
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["VISIT", "PICKUP"]).default("VISIT") }).safeParse({ date: url.searchParams.get("date"), kind: url.searchParams.get("kind") ?? "VISIT" });
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
  const startsAt = dateTimeInStoreZone(parsed.data.date, "00:00");
  if (!startsAt) return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
  const slots = await prisma.appointmentSlot.findMany({ where: { kind: parsed.data.kind, startsAt: { gte: startsAt, lt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000) } }, include: { _count: { select: { visits: true, pickups: true } } }, orderBy: { startsAt: "asc" } });
  const settings = await prisma.storeSettings.findUnique({ where: { id: "store" }, select: { appointmentOpenMinute: true, appointmentCloseMinute: true, visitCapacity: true, pickupCapacity: true } });
  return NextResponse.json({ slots, settings });
}

export async function PATCH(request: Request) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const parsed = z.object({ kind: z.enum(["VISIT", "PICKUP"]), date: z.string(), time: z.string(), closed: z.boolean().optional(), capacity: z.number().int().min(1).max(100).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid store slot." }, { status: 400 });
  const startsAt = dateTimeInStoreZone(parsed.data.date, parsed.data.time);
  if (!startsAt) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });
  const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
  const capacity = parsed.data.capacity ?? (parsed.data.kind === "VISIT" ? settings?.visitCapacity ?? 3 : settings?.pickupCapacity ?? 5);
  try {
    const slot = await prisma.$transaction(async (tx) => {
      const current = await tx.appointmentSlot.findUnique({ where: { kind_startsAt: { kind: parsed.data.kind, startsAt } } });
      const reserved = current?.reservedCount ?? 0;
      if ((parsed.data.closed && reserved > 0) || capacity < reserved) throw new Error("This slot has active bookings. Reassign them before closing or reducing capacity.");
      const result = await tx.appointmentSlot.upsert({
        where: { kind_startsAt: { kind: parsed.data.kind, startsAt } },
        create: { kind: parsed.data.kind, startsAt, endsAt: new Date(startsAt.getTime() + 3600000), capacity, closed: parsed.data.closed ?? false },
        update: { capacity, ...(parsed.data.closed !== undefined ? { closed: parsed.data.closed } : {}) },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "store.slot.update", entityType: "AppointmentSlot", entityId: result.id, metadata: { kind: parsed.data.kind, startsAt: startsAt.toISOString(), closed: result.closed, capacity } } });
      return result;
    });
    return NextResponse.json({ slot });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update this slot." }, { status: 409 }); }
}
