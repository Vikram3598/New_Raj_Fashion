import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notifyVisit, scheduleVisitReminders } from "@/lib/notifications/store-visits";
import { dateTimeInStoreZone, reserveStoreSlot, releaseStoreSlot, validateStoreSlot } from "@/lib/store-slots";

const schema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "ARRIVED", "COMPLETED", "CANCELLED", "MISSED"]).optional(),
  assignedStaffId: z.string().nullable().optional(), internalNotes: z.string().trim().max(5000).nullable().optional(), outcome: z.string().trim().max(2000).nullable().optional(),
  date: z.string().optional(), time: z.string().optional(),
});
const visitTransitions: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "PREPARING", "READY", "CANCELLED", "MISSED"],
  CONFIRMED: ["PREPARING", "READY", "ARRIVED", "COMPLETED", "CANCELLED", "MISSED"],
  PREPARING: ["READY", "ARRIVED", "COMPLETED", "CANCELLED", "MISSED"],
  READY: ["ARRIVED", "COMPLETED", "CANCELLED", "MISSED"],
  ARRIVED: ["COMPLETED", "MISSED"],
  COMPLETED: [], CANCELLED: [], MISSED: [],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { visitId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid visit update.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const current = await prisma.storeVisit.findUnique({ where: { id: visitId }, include: { slot: true, items: true } });
  if (!current) return NextResponse.json({ error: "Store visit not found." }, { status: 404 });
  const data = parsed.data;
  if (data.status && data.status !== current.status && !visitTransitions[current.status]?.includes(data.status)) return NextResponse.json({ error: "That visit status change is not allowed." }, { status: 409 });
  if ((data.date || data.time) && !["PENDING", "CONFIRMED"].includes(current.status)) return NextResponse.json({ error: "Only pending or confirmed visits can be rescheduled." }, { status: 409 });
  if (data.status === "CANCELLED" && (data.date || data.time)) return NextResponse.json({ error: "Cancel or reschedule a visit in separate actions." }, { status: 400 });
  if (data.assignedStaffId) {
    const staff = await prisma.user.findFirst({ where: { id: data.assignedStaffId, status: "ACTIVE", staffProfile: { status: "ACTIVE" }, roles: { some: { role: { name: "STAFF" } } } }, select: { id: true } });
    if (!staff) return NextResponse.json({ error: "Choose an active staff account." }, { status: 400 });
  }
  let startsAt: Date | undefined;
  if (data.date || data.time) {
    startsAt = data.date && data.time ? dateTimeInStoreZone(data.date, data.time) ?? undefined : undefined;
    if (!startsAt) return NextResponse.json({ error: "Provide both a valid date and time." }, { status: 400 });
    const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
    const invalid = validateStoreSlot(startsAt, settings?.appointmentOpenMinute ?? 600, settings?.appointmentCloseMinute ?? 1200, settings?.openingHours);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      let slotId = current.slotId;
      if (startsAt && startsAt.getTime() !== current.slot.startsAt.getTime()) {
        const settings = await tx.storeSettings.findUnique({ where: { id: "store" } });
        const newSlot = await reserveStoreSlot(tx, { kind: "VISIT", startsAt, capacity: settings?.visitCapacity ?? 3 });
        slotId = newSlot.id;
      }
      const nextStatus = data.status ?? current.status;
      const update = await tx.storeVisit.updateMany({ where: { id: current.id, status: current.status, slotId: current.slotId }, data: {
        ...(data.status ? { status: data.status } : {}), ...(data.assignedStaffId !== undefined ? { assignedStaffId: data.assignedStaffId } : {}),
        ...(data.internalNotes !== undefined ? { internalNotes: data.internalNotes } : {}), ...(data.outcome !== undefined ? { outcome: data.outcome } : {}), slotId,
      } });
      if (!update.count) throw new Error("This visit was changed by another user. Refresh and try again.");
      if (slotId !== current.slotId) {
        await releaseStoreSlot(tx, current.slotId);
        await tx.visitReminder.updateMany({ where: { visitId: current.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Visit rescheduled" } });
      }
      if (["CANCELLED", "COMPLETED", "MISSED"].includes(nextStatus) && !["CANCELLED", "COMPLETED", "MISSED"].includes(current.status)) {
        await releaseStoreSlot(tx, slotId);
        await tx.visitReminder.updateMany({ where: { visitId: current.id, status: "QUEUED" }, data: { status: "SKIPPED", error: `Visit ${nextStatus.toLowerCase()}` } });
      }
      if (data.status && data.status !== current.status) await tx.visitStatusHistory.create({ data: { visitId: current.id, fromStatus: current.status, toStatus: data.status, actorId: actor.id, note: data.internalNotes ?? null } });
      const updated = await tx.storeVisit.findUniqueOrThrow({ where: { id: current.id }, include: { slot: true, items: true } });
      if (startsAt && startsAt.getTime() !== current.slot.startsAt.getTime() && updated.status !== "CANCELLED") {
        const settings = await tx.storeSettings.findUnique({ where: { id: "store" } });
        await scheduleVisitReminders(tx, updated.id, updated.slot.startsAt, settings?.visitReminderMinutes ?? [1440, 120, 30]);
      }
      return updated;
    });
    const assignedChanged = data.assignedStaffId !== undefined && data.assignedStaffId !== current.assignedStaffId;
    const key = `store-visit:${current.id}:owner-update:${updated.updatedAt.toISOString()}`;
    const title = assignedChanged ? `Visit ${current.reference} assigned to staff` : `Visit ${current.reference} updated`;
    const message = `Visit status: ${updated.status}. Arrival: ${updated.slot.startsAt.toISOString()}.`;
    await notifyVisit({ visit: updated, eventKey: key, title, message });
    return NextResponse.json({ visit: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update visit.";
    return NextResponse.json({ error: message }, { status: message.includes("no longer available") ? 409 : 400 });
  }
}
