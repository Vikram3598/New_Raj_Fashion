import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";

const schema = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]), staffNote: z.string().trim().max(2000).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  let actor;
  try { actor = await requirePermission(PERMISSIONS.CUSTOMER_READ); } catch { return NextResponse.json({ error: "You cannot access customer enquiries." }, { status: 403 }); }
  const { requestId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid enquiry status and note." }, { status: 400 });
  const found = await prisma.supportRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true } });
  if (!found) return NextResponse.json({ error: "Enquiry not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.supportRequest.update({ where: { id: requestId }, data: { status: parsed.data.status, staffNote: parsed.data.staffNote || null } }),
    prisma.auditLog.create({ data: { actorId: actor.id, action: "support.request.update", entityType: "SupportRequest", entityId: requestId, metadata: { from: found.status, to: parsed.data.status } } }),
  ]);
  return NextResponse.json({ ok: true });
}
