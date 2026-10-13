import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { invitationId } = await params;
  const invitation = await prisma.staffInvitation.findFirst({ where: { id: invitationId, acceptedAt: null } });
  if (!invitation) return NextResponse.json({ error: "Pending invitation not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.staffInvitation.delete({ where: { id: invitationId } }),
    prisma.auditLog.create({ data: { actorId: actor.id, action: "staff.invitation.revoke", entityType: "StaffInvitation", entityId: invitationId } }),
  ]);
  return NextResponse.json({ ok: true });
}
