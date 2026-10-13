import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export const metadata = { title: "Customers · Staff" };

export default async function StaffCustomersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  try { await requirePermission(PERMISSIONS.CUSTOMER_READ); } catch { redirect("/shopkeeper/login"); }
  const parsedPage = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10000) : 1;
  const where = { roles: { some: { role: { name: "CUSTOMER" as const } } }, status: "ACTIVE" as const };
  const [customers, count] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, select: { id: true, username: true, customerCode: true, profile: { select: { fullName: true } }, _count: { select: { orders: true } } } }),
    prisma.user.count({ where }),
  ]);
  return <main className="container-nrf py-10"><Link href="/shopkeeper/staff/dashboard" className="text-sm text-maroon-700">← Staff dashboard</Link><h1 className="mt-2 font-serif text-4xl">Customer lookup</h1><p className="mt-2 text-sm text-[var(--muted)]">This limited view shows account codes and order counts only. Contact details and addresses are not exposed here.</p><div className="mt-6 grid gap-3">{customers.map((customer) => <article key={customer.id} className="card-nrf flex flex-wrap justify-between gap-3 p-4"><div><p className="font-medium">{customer.profile?.fullName ?? customer.username}</p><p className="mt-1 text-xs text-[var(--muted)]">{customer.customerCode} · @{customer.username}</p></div><p className="text-sm">{customer._count.orders} orders</p></article>)}{!customers.length && <p className="card-nrf p-6 text-sm text-[var(--muted)]">No customers found.</p>}</div><div className="mt-4 flex justify-between text-sm">{page > 1 ? <Link href={`/shopkeeper/staff/customers?page=${page - 1}`} className="text-maroon-700">Previous</Link> : <span/>}{page * 50 < count ? <Link href={`/shopkeeper/staff/customers?page=${page + 1}`} className="text-maroon-700">Next</Link> : null}</div></main>;
}
