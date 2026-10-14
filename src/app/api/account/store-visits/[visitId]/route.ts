import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notifyVisit, scheduleVisitReminders } from "@/lib/notifications/store-visits";
import { dateTimeInStoreZone, reserveStoreSlot, releaseStoreSlot, validateStoreSlot } from "@/lib/store-slots";

const schema = z.object({ action: z.enum(["cancel", "reschedule"]), date: z.string().optional(), time: z.string().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { visitId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid store visit change." }, { status: 400 });
  const current = await prisma.storeVisit.findFirst({ where: { id: visitId, userId: user.id }, include: { slot: true, items: true } });
  if (!current) return NextResponse.json({ error: "Store visit not found." }, { status: 404 });
  if (!["PENDING", "CONFIRMED"].includes(current.status)) return NextResponse.json({ error: "This request can no longer be changed online. Please contact the store." }, { status: 409 });
  if (current.slot.startsAt.getTime() < Date.now() + 2 * 60 * 60 * 1000) return NextResponse.json({ error: "Changes must be made at least two hours before arrival. Please call the showroom." }, { status: 409 });

  try {
    if (parsed.data.action === "cancel") {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.storeVisit.updateMany({ where: { id: current.id, userId: user.id, status: { in: ["PENDING", "CONFIRMED"] } }, data: { status: "CANCELLED" } });
        if (!claim.count) throw new Error("This request was already changed.");
        await releaseStoreSlot(tx, current.slotId);
        await tx.visitStatusHistory.create({ data: { visitId: current.id, fromStatus: current.status, toStatus: "CANCELLED", actorId: user.id, note: "Customer cancelled the visit request." } });
        await tx.visitReminder.updateMany({ where: { visitId: current.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Visit cancelled" } });
      });
      const updated = { ...current, status: "CANCELLED" as const };
      await notifyVisit({ visit: updated, eventKey: `store-visit:${current.id}:cancelled:${current.updatedAt.toISOString()}`, title: `Store visit ${current.reference} cancelled`, message: "The customer cancelled this store visit request." });
      return NextResponse.json({ ok: true, status: "CANCELLED" });
    }

    const startsAt = parsed.data.date && parsed.data.time ? dateTimeInStoreZone(parsed.data.date, parsed.data.time) : null;
    if (!startsAt) return NextResponse.json({ error: "Choose a valid new date and time." }, { status: 400 });
    const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
    const capacity = settings?.visitCapacity ?? 3;
    const invalid = validateStoreSlot(startsAt, settings?.appointmentOpenMinute ?? 600, settings?.appointmentCloseMinute ?? 1200, settings?.openingHours);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (startsAt.getTime() === current.slot.startsAt.getTime()) return NextResponse.json({ ok: true, status: current.status });
    const updated = await prisma.$transaction(async (tx) => {
      const newSlot = await reserveStoreSlot(tx, { kind: "VISIT", startsAt, capacity });
      const claim = await tx.storeVisit.updateMany({ where: { id: current.id, userId: user.id, slotId: current.slotId, status: { in: ["PENDING", "CONFIRMED"] } }, data: { slotId: newSlot.id, status: "PENDING" } });
      if (!claim.count) throw new Error("This request was already changed.");
      await releaseStoreSlot(tx, current.slotId);
      await tx.visitStatusHistory.create({ data: { visitId: current.id, fromStatus: current.status, toStatus: "PENDING", actorId: user.id, note: `Customer requested a new time: ${startsAt.toISOString()}` } });
      await tx.visitReminder.updateMany({ where: { visitId: current.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Visit rescheduled" } });
      const updated = await tx.storeVisit.findUniqueOrThrow({ where: { id: current.id }, include: { slot: true, items: true } });
      await scheduleVisitReminders(tx, updated.id, updated.slot.startsAt, settings?.visitReminderMinutes ?? [1440, 120, 30]);
      return updated;
    });
    await notifyVisit({ visit: updated, eventKey: `store-visit:${current.id}:rescheduled:${updated.slot.startsAt.toISOString()}`, title: `Store visit ${current.reference} changed`, message: "The customer requested a different arrival time. Please review and confirm availability." });
    return NextResponse.json({ ok: true, status: updated.status, date: updated.slot.startsAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the store visit.";
    return NextResponse.json({ error: message }, { status: message.includes("no longer available") ? 409 : 400 });
  }
}
