import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";
import Link from "next/link";

export const metadata = { title: "Payments · Owner" };

export default async function OwnerPaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/payments"); }
  const { page: raw } = await searchParams;
  const pageSize = 25;
  const requested = Math.max(1, Number.parseInt(raw ?? "1", 10) || 1);
  const total = await prisma.payment.count();
  const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
  const payments = await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { order: { select: { id: true, orderNumber: true, user: { select: { customerCode: true } } } }, refunds: { select: { amountPaise: true, status: true } } } });
  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Payments</h1><p className="mt-2 text-sm text-[var(--muted)]">Provider records and refund status from the payment ledger.</p>
    {payments.length ? <div className="mt-6 grid gap-3">{payments.map((payment) => <article key={payment.id} className="card-nrf flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5"><div><Link href={`/shopkeeper/owner/orders`} className="font-medium text-maroon-700">{payment.order.orderNumber}</Link><p className="mt-1 text-xs text-[var(--muted)]">Customer {payment.order.user.customerCode} · {payment.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p><p className="mt-2 text-sm">{payment.method} · {payment.provider} · {payment.status}</p><p className="mt-1 text-xs text-[var(--muted)]">Provider payment: {payment.providerPaymentId ? `${payment.providerPaymentId.slice(0, 5)}…${payment.providerPaymentId.slice(-4)}` : "Not assigned"}</p>{payment.refunds.length ? <p className="mt-1 text-xs text-[var(--muted)]">Refunds: {payment.refunds.map((refund) => `${paiseToInr(refund.amountPaise)} ${refund.status.toLowerCase()}`).join(" · ")}</p> : null}</div><p className="font-medium">{paiseToInr(payment.amountPaise)}</p></article>)}</div> : <p className="card-nrf mt-6 p-6 text-sm text-[var(--muted)]">Payment records will appear when orders are placed.</p>}
    {total > pageSize ? <nav aria-label="Payment pages" className="mt-5 flex justify-between text-sm"><span>Page {page} of {Math.ceil(total / pageSize)}</span><div className="flex gap-4">{page > 1 ? <Link className="text-maroon-700" href={`?page=${page - 1}`}>Previous</Link> : null}{page * pageSize < total ? <Link className="text-maroon-700" href={`?page=${page + 1}`}>Next</Link> : null}</div></nav> : null}
  </main>;
}
