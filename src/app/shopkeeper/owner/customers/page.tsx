import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const metadata = { title: "Customers · Owner" };

export default async function OwnerCustomersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/customers"); }
  const { page: raw } = await searchParams;
  const pageSize = 30;
  const requested = Math.max(1, Number.parseInt(raw ?? "1", 10) || 1);
  const where = { status: "ACTIVE" as const, roles: { some: { role: { name: "CUSTOMER" as const } } } };
  const total = await prisma.user.count({ where });
  const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
  const customers = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, customerCode: true, username: true, createdAt: true, profile: { select: { fullName: true } }, identities: { where: { verifiedAt: { not: null } }, select: { type: true, valueNormalized: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, _count: { select: { orders: true } } } });
  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Customers</h1><p className="mt-2 text-sm text-[var(--muted)]">Customer accounts and order counts. Contact details are shown only to authorized owners.</p>
    {customers.length ? <div className="mt-6 grid gap-3">{customers.map((customer) => <article key={customer.id} className="card-nrf p-4 sm:p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-medium">{customer.profile?.fullName || customer.username}</p><p className="mt-1 text-xs text-[var(--muted)]">{customer.customerCode} · joined {customer.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</p></div><Link className="text-sm text-maroon-700" href="/shopkeeper/owner/orders">{customer._count.orders} orders</Link></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">{customer.identities.map((identity) => <span key={`${identity.type}-${identity.valueNormalized}`} className="text-[var(--muted)]">{identity.type === "PHONE" ? "Phone" : identity.type === "EMAIL" ? "Email" : identity.type}: {identity.valueNormalized}</span>)}</div></article>)}</div> : <p className="card-nrf mt-6 p-6 text-sm text-[var(--muted)]">Customer accounts will appear here after registration.</p>}
    {total > pageSize ? <nav className="mt-5 flex justify-between text-sm"><span>Page {page} of {Math.ceil(total / pageSize)}</span><div className="flex gap-4">{page > 1 ? <Link className="text-maroon-700" href={`?page=${page - 1}`}>Previous</Link> : null}{page * pageSize < total ? <Link className="text-maroon-700" href={`?page=${page + 1}`}>Next</Link> : null}</div></nav> : null}
  </main>;
}
