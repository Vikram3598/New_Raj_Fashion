import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";

export const metadata = { title: "My orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getSessionUser();
  if (!user) return null;
  const { page: rawPage } = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = 20;
  const total = await prisma.order.count({ where: { userId: user.id } });
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const orders = await prisma.order.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, orderNumber: true, createdAt: true, totalPaise: true, fulfilmentStatus: true, paymentStatus: true, _count: { select: { items: true } } },
  });
  return <div className="card-nrf p-5 sm:p-6">
    <h2 className="font-serif text-3xl">Your orders</h2>
    {orders.length ? <div className="mt-5 grid gap-3">
      {orders.map((order) => <Link key={order.id} href={`/account/orders/${order.id}`} className="rounded-xl border border-stone-200 p-4 hover:border-maroon-700 dark:border-stone-700">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">Order {order.orderNumber}</p><p className="mt-1 text-sm text-[var(--muted)]">{order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {order._count.items} {order._count.items === 1 ? "item" : "items"}</p></div><p className="font-medium">{paiseToInr(order.totalPaise)}</p></div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-cream-100 px-3 py-1 dark:bg-stone-800">{order.fulfilmentStatus.replaceAll("_", " ")}</span><span className="rounded-full bg-cream-100 px-3 py-1 dark:bg-stone-800">Payment {order.paymentStatus.toLowerCase()}</span></div>
      </Link>)}
    </div> : <div className="mt-5"><p className="text-sm text-[var(--muted)]">You have not placed an order yet.</p><Link className="btn-primary mt-4" href="/shop">Browse the collection</Link></div>}
    {total > pageSize ? <nav aria-label="Order history pages" className="mt-5 flex items-center justify-between text-sm"><span>Page {page} of {Math.ceil(total / pageSize)}</span><div className="flex gap-4">{page > 1 ? <Link className="text-maroon-700" href={`/account/orders?page=${page - 1}`}>Previous</Link> : null}{page * pageSize < total ? <Link className="text-maroon-700" href={`/account/orders?page=${page + 1}`}>Next</Link> : null}</div></nav> : null}
  </div>;
}
