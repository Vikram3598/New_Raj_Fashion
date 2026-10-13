import { NextResponse } from "next/server";
import { DEFAULT_STAFF_PERMISSIONS } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { hashSessionToken } from "@/lib/crypto";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in with the invited email or phone first." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  if (!body || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) return NextResponse.json({ error: "This invitation link is invalid." }, { status: 400 });
  const invitation = await prisma.staffInvitation.findUnique({ where: { tokenHash: hashSessionToken(body.token) } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return NextResponse.json({ error: "This invitation has expired or was already used." }, { status: 410 });
  const identityMatch = [
    ...(invitation.emailNorm ? [{ type: "EMAIL" as const, valueNormalized: invitation.emailNorm }] : []),
    ...(invitation.phoneNorm ? [{ type: "PHONE" as const, valueNormalized: invitation.phoneNorm }] : []),
  ];
  const identity = identityMatch.length ? await prisma.userIdentity.findFirst({ where: { userId: user.id, verifiedAt: { not: null }, OR: identityMatch }, select: { id: true } }) : null;
  if (!identity) return NextResponse.json({ error: "Verify the invited email or phone on your account before accepting." }, { status: 403 });
  const existing = await prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
  if (existing.some((role) => role.role.name === "OWNER")) return NextResponse.json({ error: "Owner accounts cannot accept staff invitations." }, { status: 409 });
  const staffRole = await prisma.role.findUnique({ where: { name: "STAFF" } });
  if (!staffRole) return NextResponse.json({ error: "Staff roles are not seeded yet." }, { status: 503 });
  const permissions = await prisma.permission.findMany({ where: { key: { in: DEFAULT_STAFF_PERMISSIONS } } });
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.staffInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (!claimed.count) throw new Error("This invitation has already been accepted or expired.");
      await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: staffRole.id } }, update: { assignedBy: invitation.invitedById }, create: { userId: user.id, roleId: staffRole.id, assignedBy: invitation.invitedById } });
      const profile = await tx.staffProfile.upsert({ where: { userId: user.id }, update: { status: "ACTIVE" }, create: { userId: user.id, status: "ACTIVE" } });
      for (const permission of permissions) await tx.staffPermissionGrant.upsert({ where: { staffId_permissionId: { staffId: profile.id, permissionId: permission.id } }, update: { granted: true }, create: { staffId: profile.id, permissionId: permission.id, granted: true } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "staff.invitation.accept", entityType: "StaffInvitation", entityId: invitation.id } });
    });
    return NextResponse.json({ ok: true, destination: "/shopkeeper" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invitation could not be accepted." }, { status: 409 });
  }
}
