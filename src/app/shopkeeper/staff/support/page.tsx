import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { SupportInbox } from "@/components/shopkeeper/support-inbox";

export const metadata = { title: "Customer enquiries · Staff" };

export default async function StaffSupportPage() {
  try { await requirePermission(PERMISSIONS.CUSTOMER_READ); } catch { redirect("/shopkeeper/login?next=/shopkeeper/staff/support"); }
  const requests = await prisma.supportRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Customer enquiries</h1><p className="mt-2 text-sm text-[var(--muted)]">Messages needed for customer service are visible to staff with customer access.</p><SupportInbox requests={requests.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}/></main>;
}
