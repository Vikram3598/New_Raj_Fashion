import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { SupportInbox } from "@/components/shopkeeper/support-inbox";

export const metadata = { title: "Customer enquiries · Owner" };

export default async function OwnerSupportPage() {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/support"); }
  const requests = await prisma.supportRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Customer enquiries</h1><p className="mt-2 text-sm text-[var(--muted)]">Customer messages are stored for the store team and can be followed up here.</p><SupportInbox requests={requests.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}/></main>;
}
