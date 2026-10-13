import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { hashSessionToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { SessionManager } from "@/components/account/session-manager";

export const metadata = { title: "Signed-in sessions" };

export default async function AccountSessionsPage() {
  const user = await requireUser();
  const jar = await cookies();
  const token = jar.get(process.env.SESSION_COOKIE_NAME ?? "nrf_session")?.value;
  const currentHash = token ? hashSessionToken(token) : null;
  const rows = await prisma.userSession.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true, tokenHash: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true } });
  const sessions = rows.map(({ tokenHash, ...row }) => ({ ...row, current: tokenHash === currentHash, createdAt: row.createdAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(), expiresAt: row.expiresAt.toISOString() }));
  return <div><h2 className="font-serif text-3xl">Signed-in sessions</h2><p className="mt-2 text-sm text-[var(--muted)]">Review devices with access to this account and revoke sessions you no longer use.</p><SessionManager initialSessions={sessions} /></div>;
}
