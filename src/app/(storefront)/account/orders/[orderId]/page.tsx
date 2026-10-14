import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";
import { OrderRequest } from "@/components/account/order-request";
import { ReviewForm } from "@/components/account/review-form";
import { PickupCode } from "@/components/account/pickup-code";

export const metadata = { title: "Order details" };

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user) return null;
  const { orderId } = await params;
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: { items: { include: { variant: { select: { productId: true, product: { select: { name: true } } } } } }, payments: { select: { method: true, status: true, amountPaise: true, currency: true } }, refunds: { orderBy: { createdAt: "asc" }, select: { amountPaise: true, status: true, createdAt: true } }, statusHistory: { orderBy: { createdAt: "asc" }, select: { fromStatus: true, toStatus: true, createdAt: true } }, shipments: { orderBy: { createdAt: "desc" }, take: 1 }, fulfilment: { select: { type: true, status: true, pickupSlot: { select: { startsAt: true } } } } },
  });
  if (!order) notFound();
  const productById = new Map<string, string>();
  for (const item of order.items) if (item.variant) productById.set(item.variant.productId, item.variant.product.name);
  const existingReviews = order.fulfilmentStatus === "DELIVERED" && productById.size
    ? await prisma.productReview.findMany({ where: { userId: user.id, productId: { in: [...productById.keys()] } }, select: { productId: true } })
    : [];
  const reviewed = new Set(existingReviews.map((review) => review.productId));
  const address = order.shippingSnapshot as { recipient?: string; line1?: string; line2?: string | null; city?: string; state?: string; postalCode?: string; country?: string; phone?: string | null; address?: string; storeName?: string; pickupAt?: string };
  return <div className="grid gap-5">
    <div className="card-nrf p-5 sm:p-6">
      <Link href="/account/orders" className="text-sm text-maroon-700">← All orders</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-[var(--muted)]">Order number</p><h2 className="font-serif text-3xl">{order.orderNumber}</h2><p className="mt-1 text-sm text-[var(--muted)]">Placed {order.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p></div><span className="rounded-full bg-cream-100 px-3 py-2 text-sm dark:bg-stone-800">{order.fulfilmentStatus.replaceAll("_", " ")}</span></div>
    </div>
    <div className="card-nrf p-5 sm:p-6"><h3 className="font-serif text-2xl">Items</h3><div className="mt-3 divide-y divide-stone-200 dark:divide-stone-800">{order.items.map((item) => <div key={item.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{item.productName}</p><p className="mt-1 text-[var(--muted)]">{item.variantTitle} · Qty {item.quantity}</p></div><p>{paiseToInr(item.lineTotalPaise)}</p></div>)}</div>
      <div className="ml-auto mt-4 max-w-xs space-y-1 border-t border-stone-200 pt-3 text-sm dark:border-stone-800"><p className="flex justify-between"><span>Subtotal</span><span>{paiseToInr(order.subtotalPaise)}</span></p><p className="flex justify-between"><span>Discount</span><span>−{paiseToInr(order.discountPaise)}</span></p><p className="flex justify-between"><span>Delivery</span><span>{paiseToInr(order.shippingPaise)}</span></p><p className="flex justify-between"><span>Tax</span><span>{paiseToInr(order.taxPaise)}</span></p><p className="flex justify-between border-t border-stone-200 pt-2 font-semibold dark:border-stone-800"><span>Total</span><span>{paiseToInr(order.totalPaise)}</span></p></div>
    </div>
    {order.fulfilmentStatus === "DELIVERED" && productById.size > 0 ? <section className="card-nrf p-5"><h3 className="font-serif text-xl">Verified purchase reviews</h3><p className="mt-1 text-sm text-[var(--muted)]">Reviews are checked by the store before they appear publicly.</p><div className="mt-3 grid gap-3">{[...productById].map(([productId, name]) => <ReviewForm key={productId} orderId={order.id} productId={productId} productName={name} submitted={reviewed.has(productId)} />)}</div></section> : null}
    <div className="grid gap-5 md:grid-cols-2">
      {order.fulfilment?.type === "STORE_PICKUP" ? <section className="card-nrf p-5"><h3 className="font-serif text-xl">Store pickup</h3><p className="mt-2 font-medium">{address.storeName ?? "New Raj Fashion and Raj Saree Showroom"}</p><p className="mt-1 text-sm">{address.address ?? "Gandhi Chowk, Sidhi, Madhya Pradesh 486661"}</p><p className="mt-3 text-sm">Pickup status: {order.fulfilment.status.replaceAll("_", " ")}</p><p className="mt-1 text-sm">Scheduled: {order.fulfilment.pickupSlot ? order.fulfilment.pickupSlot.startsAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : address.pickupAt ? new Date(address.pickupAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "To be arranged"}</p>{["READY", "SCHEDULED"].includes(order.fulfilment.status) ? <PickupCode orderId={order.id} /> : <p className="mt-3 text-xs text-[var(--muted)]">We will notify you when preparation is complete. The one-time pickup code is available after the order is ready.</p>}</section> : <section className="card-nrf p-5"><h3 className="font-serif text-xl">Delivery address</h3><div className="mt-3 text-sm leading-6">{address.recipient}<br />{address.line1}{address.line2 ? <><br />{address.line2}</> : null}<br />{address.city}, {address.state} {address.postalCode}<br />{address.country ?? "IN"}{address.phone ? <><br />Phone: {address.phone}</> : null}</div></section>}
      <section className="card-nrf p-5"><h3 className="font-serif text-xl">Payment and refunds</h3>{order.payments.map((payment, i) => <div key={i} className="mt-3 text-sm"><p>{payment.method.replaceAll("_", " ")} · {payment.status.toLowerCase()}</p><p className="mt-1 text-[var(--muted)]">{paiseToInr(payment.amountPaise)} {payment.currency}</p></div>)}{order.refunds.map((refund, i) => <div key={`refund-${i}`} className="mt-3 border-t border-stone-200 pt-3 text-sm dark:border-stone-800"><p>Refund · {refund.status.toLowerCase()} · {paiseToInr(refund.amountPaise)}</p><p className="mt-1 text-xs text-[var(--muted)]">Updated {refund.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p></div>)}</section>
    </div>
    <OrderRequest orderId={order.id} canCancel={["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING"].includes(order.fulfilmentStatus) && !["FAILED", "REFUNDED"].includes(order.paymentStatus)} canReturn={order.fulfilmentStatus === "DELIVERED"} />
    {(order.paymentStatus === "PAID" || (order.payments.some((payment) => payment.method === "COD") && order.fulfilmentStatus === "DELIVERED")) ? <a className="btn-secondary w-fit" href={`/api/account/orders/${order.id}/invoice`}>Download invoice (PDF)</a> : null}
    {order.shipments[0] ? <section className="card-nrf p-5"><h3 className="font-serif text-xl">Shipment</h3><p className="mt-2 text-sm">{order.shipments[0].status.replaceAll("_", " ")}{order.shipments[0].carrier ? ` · ${order.shipments[0].carrier}` : ""}</p>{order.shipments[0].trackingNumber ? <p className="mt-1 text-sm">Tracking number: <span className="font-mono">{order.shipments[0].trackingNumber}</span></p> : null}</section> : null}
    <section className="card-nrf p-5"><h3 className="font-serif text-xl">Order updates</h3>{order.statusHistory.length ? <ol className="mt-3 grid gap-3">{order.statusHistory.map((event, i) => <li key={`${event.createdAt.toISOString()}-${i}`} className="border-l-2 border-maroon-700 pl-3 text-sm"><p className="font-medium">{event.toStatus.replaceAll("_", " ")}</p><p className="text-[var(--muted)]">{event.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p></li>)}</ol> : <p className="mt-2 text-sm text-[var(--muted)]">Updates will appear here when the order is processed.</p>}</section>
  </div>;
}
