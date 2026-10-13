import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireUser, destroySession } from "@/lib/auth/session";
import { hashSessionToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";

const schema = z.object({ sessionId: z.string().optional() }).strict();

export async function DELETE(request: Request) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Sign in to manage sessions." }, { status: 401 }); }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid session request." }, { status: 400 });
  const jar = await cookies();
  const token = jar.get(process.env.SESSION_COOKIE_NAME ?? "nrf_session")?.value;
  const currentHash = token ? hashSessionToken(token) : null;
  if (parsed.data.sessionId) {
    const target = await prisma.userSession.findFirst({ where: { id: parsed.data.sessionId, userId: user.id, revokedAt: null } });
    if (!target) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    await prisma.userSession.updateMany({ where: { id: target.id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: user.id, action: "account.session.revoke", entityType: "UserSession", entityId: target.id } });
    if (target.tokenHash === currentHash) await destroySession();
    return NextResponse.json({ ok: true });
  }
  const result = await prisma.userSession.updateMany({
    where: { userId: user.id, revokedAt: null, ...(currentHash ? { tokenHash: { not: currentHash } } : {}) },
    data: { revokedAt: new Date() },
  });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "account.sessions.revoke_others", entityType: "User", entityId: user.id, metadata: { count: result.count } } });
  return NextResponse.json({ ok: true, revoked: result.count });
}
