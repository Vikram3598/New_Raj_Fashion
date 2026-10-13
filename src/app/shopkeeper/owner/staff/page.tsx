import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { StaffManager } from "@/components/shopkeeper/staff-manager";
export const metadata = { title: "Staff access · Owner" };
export default async function StaffPage() {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/staff"); }
  const rows = await prisma.staffProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true, customerCode: true, roles: { select: { role: { select: { name: true } } } } } },
      grants: { where: { granted: true }, include: { permission: { select: { key: true } } } },
    },
  });
  const pendingInvitations = await prisma.staffInvitation.findMany({ where: { acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, emailNorm: true, phoneNorm: true, expiresAt: true } });
  const staff = rows.filter((s) => s.user.roles.some((r) => r.role.name === "STAFF") && !s.user.roles.some((r) => r.role.name === "OWNER")).map((s) => ({
    id: s.user.id, username: s.user.username, customerCode: s.user.customerCode, status: s.status, permissions: s.grants.map((g) => g.permission.key),
  }));
  return <main className="container-nrf max-w-4xl py-10"><Link href="/shopkeeper/owner" className="text-sm text-maroon-700">← Owner overview</Link><h1 className="mt-2 font-serif text-4xl">Staff access</h1><p className="mt-2 text-sm text-[var(--muted)]">Staff permission changes are enforced by server-side authorization.</p><StaffManager staff={staff} invitations={pendingInvitations.map((invitation) => ({ ...invitation, expiresAt: invitation.expiresAt.toISOString() }))}/></main>;
}
