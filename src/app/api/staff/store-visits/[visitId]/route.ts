import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { notifyVisit } from "@/lib/notifications/store-visits";

const schema = z.object({ status: z.enum(["PREPARING", "READY"]).optional(), tasks: z.array(z.object({ id: z.string(), completed: z.boolean(), internalNote: z.string().max(1000).optional(), alternative: z.string().max(500).optional() })).max(10).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  let staff;
  try { staff = await requirePermission(PERMISSIONS.STORE_VISIT_PREPARE); } catch { return NextResponse.json({ error: "Assigned staff access is required." }, { status: 403 }); }
  const { visitId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preparation update." }, { status: 400 });
  const current = await prisma.storeVisit.findFirst({ where: { id: visitId, assignedStaffId: staff.id }, include: { slot: true, items: true, tasks: true } });
  if (!current) return NextResponse.json({ error: "Assigned visit not found." }, { status: 404 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      for (const task of parsed.data.tasks ?? []) {
        const claim = await tx.visitPreparationTask.updateMany({ where: { id: task.id, visitId: current.id, OR: [{ assignedStaffId: null }, { assignedStaffId: staff.id }] }, data: { completed: task.completed, internalNote: task.internalNote, alternative: task.alternative, assignedStaffId: staff.id } });
        if (!claim.count) throw new Error("A preparation task no longer belongs to this visit.");
      }
      if (parsed.data.status === "READY") {
        const remaining = await tx.visitPreparationTask.count({ where: { visitId: current.id, completed: false } });
        if (remaining) throw new Error("Complete the preparation checklist before marking this visit ready.");
      }
      if (parsed.data.status && parsed.data.status !== current.status) {
        const changed = await tx.storeVisit.updateMany({ where: { id: current.id, assignedStaffId: staff.id, status: { in: ["CONFIRMED", "PREPARING", "READY"] } }, data: { status: parsed.data.status } });
        if (!changed.count) throw new Error("This visit cannot be moved to that status.");
        await tx.visitStatusHistory.create({ data: { visitId: current.id, fromStatus: current.status, toStatus: parsed.data.status, actorId: staff.id, note: "Staff preparation update" } });
      }
      return tx.storeVisit.findUniqueOrThrow({ where: { id: current.id }, include: { slot: true, items: true, tasks: true } });
    });
    if (parsed.data.status) await notifyVisit({ visit: updated, eventKey: `store-visit:${updated.id}:staff-status:${updated.status}:${updated.updatedAt.toISOString()}`, title: `Store visit ${updated.reference} preparation updated`, message: `Preparation status: ${updated.status}.` });
    return NextResponse.json({ visit: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update preparation." }, { status: 400 }); }
}
