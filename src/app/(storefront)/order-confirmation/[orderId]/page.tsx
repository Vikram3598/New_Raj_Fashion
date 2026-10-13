import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";

export const metadata = { title: "Order confirmation" };

export default async function OrderConfirmationPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account/orders");
  const { orderId } = await params;
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id }, select: { orderNumber: true, totalPaise: true, paymentStatus: true, fulfilmentStatus: true, createdAt: true } });
  if (!order) notFound();
  const paid = order.paymentStatus === "PAID";
  return <div className="container-nrf py-16"><section className="card-nrf mx-auto max-w-2xl p-6 text-center sm:p-10"><p className="text-sm uppercase tracking-[.2em] text-maroon-700">{paid ? "Payment confirmed" : "Order received"}</p><h1 className="mt-3 font-serif text-4xl">{paid ? "Thank you for your order" : "Your order is being processed"}</h1><p className="mt-3 text-[var(--muted)]">Order {order.orderNumber} · {paiseToInr(order.totalPaise)}</p><p className="mt-2 text-sm">Payment: {order.paymentStatus.toLowerCase()} · Status: {order.fulfilmentStatus.replaceAll("_", " ").toLowerCase()}</p>{order.paymentStatus === "PENDING" ? <p className="mt-4 text-sm text-[var(--muted)]">If you completed online payment, the provider confirmation may take a moment. Refresh this page or check your orders shortly.</p> : null}<div className="mt-7 flex flex-wrap justify-center gap-3"><Link href={`/account/orders/${orderId}`} className="btn-primary">View order</Link><Link href="/shop" className="btn-secondary">Continue shopping</Link></div></section></div>;
}
