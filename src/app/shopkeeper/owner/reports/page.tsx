import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";

export const metadata = { title: "Reports · Owner" };

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function parseDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return fallback;
  return value;
}

export default async function OwnerReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/reports"); }
  const params = await searchParams;
  const today = dateKey(new Date());
  const defaultFromDate = new Date(`${today}T12:00:00Z`);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  let from = parseDate(params.from, dateKey(defaultFromDate));
  const to = parseDate(params.to, today);
  if (from > to) from = to;
  const fromAt = new Date(`${from}T00:00:00+05:30`);
  const toAt = new Date(`${to}T00:00:00+05:30`);
  const until = new Date(toAt.getTime() + 24 * 60 * 60 * 1000);
  const [counts, revenue, trendRows, topRows, inventoryCost] = await Promise.all([
    prisma.order.groupBy({ by: ["paymentStatus"], where: { createdAt: { gte: fromAt, lt: until } }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { paymentStatus: "PAID", createdAt: { gte: fromAt, lt: until } }, _sum: { totalPaise: true } }),
    prisma.$queryRaw<Array<{ day: string; revenue: bigint; orders: bigint }>>`
      SELECT TO_CHAR((o."createdAt" AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
             SUM(o."totalPaise")::bigint AS revenue, COUNT(*)::bigint AS orders
      FROM "Order" o
      WHERE o."paymentStatus" = 'PAID' AND o."createdAt" >= ${fromAt} AND o."createdAt" < ${until}
      GROUP BY day ORDER BY day ASC
    `,
    prisma.$queryRaw<Array<{ name: string; quantity: bigint; revenue: bigint }>>`
      SELECT i."productName" AS name, SUM(i.quantity)::bigint AS quantity,
             SUM(i."lineTotalPaise")::bigint AS revenue
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE o."paymentStatus" = 'PAID' AND o."createdAt" >= ${fromAt} AND o."createdAt" < ${until}
      GROUP BY i."productName" ORDER BY revenue DESC LIMIT 8
    `,
    prisma.$queryRaw<Array<{ value: bigint | null }>>`SELECT SUM("costPaise" * ("stockOnHand" - "stockReserved"))::bigint AS value FROM "ProductVariant" WHERE "isActive" = true AND "costPaise" IS NOT NULL`,
  ]);
  const orderCount = counts.reduce((sum, row) => sum + row._count._all, 0);
  const pendingCount = counts.filter((row) => row.paymentStatus === "PENDING").reduce((sum, row) => sum + row._count._all, 0);
  const salesPaise = revenue._sum.totalPaise ?? 0;
  const maxDaily = Math.max(...trendRows.map((row) => Number(row.revenue)), 1);

  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Sales and operations</h1><p className="mt-2 text-sm text-[var(--muted)]">Figures come from stored orders and order items. Sales include paid orders only.</p>
    <form className="card-nrf mt-6 flex flex-wrap items-end gap-3 p-4"><label className="grid gap-1 text-sm">From<input className="input-nrf" type="date" name="from" value={from} /></label><label className="grid gap-1 text-sm">To<input className="input-nrf" type="date" name="to" value={to} /></label><button className="btn-primary">Apply dates</button><a className="btn-secondary" href={`/api/owner/reports/orders?from=${from}&to=${to}`}>Export orders CSV</a></form>
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><article className="card-nrf p-5"><p className="text-sm text-[var(--muted)]">Paid sales</p><p className="mt-2 font-serif text-3xl">{paiseToInr(salesPaise)}</p></article><article className="card-nrf p-5"><p className="text-sm text-[var(--muted)]">Orders</p><p className="mt-2 font-serif text-3xl">{orderCount.toLocaleString("en-IN")}</p></article><article className="card-nrf p-5"><p className="text-sm text-[var(--muted)]">Awaiting payment</p><p className="mt-2 font-serif text-3xl">{pendingCount.toLocaleString("en-IN")}</p></article><article className="card-nrf p-5"><p className="text-sm text-[var(--muted)]">Inventory cost value</p><p className="mt-2 font-serif text-3xl">{inventoryCost[0]?.value == null ? "Not configured" : paiseToInr(Number(inventoryCost[0].value))}</p><p className="mt-1 text-xs text-[var(--muted)]">Available units with a saved cost.</p></article></section>
    <section className="mt-5 grid gap-5 lg:grid-cols-2"><div className="card-nrf p-5"><h2 className="font-serif text-2xl">Daily paid sales</h2>{trendRows.length ? <div className="mt-4 grid gap-3">{trendRows.map((row) => { const amount = Number(row.revenue); const width = Math.max(2, Math.round((amount / maxDaily) * 100)); const day = new Date(`${row.day}T00:00:00+05:30`); return <div key={row.day} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 text-xs"><time>{day.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</time><div className="h-3 rounded-full bg-cream-100 dark:bg-stone-800"><div className="h-3 rounded-full bg-maroon-700" style={{ width: `${width}%` }} /></div><span>{paiseToInr(amount)}</span></div>; })}</div> : <p className="mt-4 text-sm text-[var(--muted)]">No paid orders in this date range.</p>}</div>
      <div className="card-nrf p-5"><h2 className="font-serif text-2xl">Best-selling products</h2>{topRows.length ? <ol className="mt-4 grid gap-3">{topRows.map((row, index) => <li key={row.name} className="flex justify-between gap-3 border-b border-stone-200 pb-3 text-sm last:border-0 dark:border-stone-800"><span><span className="mr-2 text-[var(--muted)]">{index + 1}.</span>{row.name}<span className="ml-2 text-xs text-[var(--muted)]">×{Number(row.quantity)}</span></span><span className="font-medium">{paiseToInr(Number(row.revenue))}</span></li>)}</ol> : <p className="mt-4 text-sm text-[var(--muted)]">Product sales will appear when paid orders are recorded.</p>}</div>
    </section>
  </main>;
}
