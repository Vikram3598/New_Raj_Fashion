import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";
import Image from "next/image";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const [profile, orderCount, addressCount, wishlist, recentOrders, recentlyViewed, notifications] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id }, select: { fullName: true } }),
    prisma.order.count({ where: { userId: user.id } }),
    prisma.address.count({ where: { userId: user.id } }),
    prisma.wishlist.findUnique({ where: { userId: user.id }, select: { _count: { select: { items: true } } } }),
    prisma.order.findMany({
      where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 4,
      select: { id: true, orderNumber: true, createdAt: true, totalPaise: true, fulfilmentStatus: true, paymentStatus: true },
    }),
    prisma.recentlyViewed.findMany({ where: { userId: user.id, product: { status: "PUBLISHED" } }, orderBy: { viewedAt: "desc" }, take: 4, include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, variants: { where: { isActive: true }, orderBy: { pricePaise: "asc" }, take: 1 } } } } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, templateKey: true, channel: true, status: true, createdAt: true } }),
  ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Orders", orderCount, "/account/orders"], ["Saved addresses", addressCount, "/account/addresses"], ["Wishlist items", wishlist?._count.items ?? 0, "/account/wishlist"]].map(([label, value, href]) => (
          <Link key={String(label)} href={String(href)} className="card-nrf p-5 transition hover:border-maroon-700">
            <p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p>
          </Link>
        ))}
      </div>

      <section className="card-nrf p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-serif text-2xl">Your details</h2><p className="mt-1 text-sm text-[var(--muted)]">{profile?.fullName || "Add your name to complete your profile."}</p></div>
          <Link className="text-sm font-medium text-maroon-700" href="/account/profile">Edit profile</Link>
        </div>
        <p className="mt-4 text-sm">Customer ID: <span className="font-mono">{user.customerCode}</span></p>
      </section>

      <section className="card-nrf p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl">Recently viewed</h2><Link href="/shop" className="text-sm font-medium text-maroon-700">Browse all</Link></div>
        {recentlyViewed.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{recentlyViewed.map(({ product }) => <Link key={product.id} href={`/product/${product.slug}`} className="rounded-xl border border-stone-200 p-3 hover:border-maroon-700 dark:border-stone-700">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt} width={220} height={260} className="aspect-[4/5] w-full rounded-lg object-cover" unoptimized/> : <div className="aspect-[4/5] rounded-lg bg-cream-100 dark:bg-stone-800"/>}<p className="mt-2 line-clamp-2 text-sm font-medium">{product.name}</p>{product.variants[0] ? <p className="mt-1 text-sm text-[var(--muted)]">{paiseToInr(product.variants[0].pricePaise)}</p> : null}</Link>)}</div> : <p className="mt-3 text-sm text-[var(--muted)]">Products you view will appear here.</p>}
      </section>

      <section className="card-nrf p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl">Account notifications</h2><Link href="/account/preferences" className="text-sm font-medium text-maroon-700">Preferences</Link></div>
        {notifications.length ? <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-800">{notifications.map((notification) => <li key={notification.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{notification.templateKey.startsWith("order.") ? "Order update" : notification.templateKey.startsWith("payment") ? "Payment update" : notification.templateKey.replaceAll(".", " ")}</span><span className="text-xs text-[var(--muted)]">{notification.channel} · {notification.status.toLowerCase()} · {notification.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span></li>)}</ul> : <p className="mt-3 text-sm text-[var(--muted)]">Relevant order and payment messages will appear here.</p>}
      </section>

      <section className="card-nrf p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl">Recent orders</h2><Link href="/account/orders" className="text-sm font-medium text-maroon-700">View all</Link></div>
        {recentOrders.length ? <div className="mt-4 divide-y divide-stone-200 dark:divide-stone-800">
          {recentOrders.map((order) => <Link key={order.id} href={`/account/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm hover:text-maroon-700">
            <div><p className="font-medium">{order.orderNumber}</p><p className="mt-1 text-[var(--muted)]">{order.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} · {order.fulfilmentStatus.replaceAll("_", " ")}</p></div>
            <div className="text-right"><p className="font-medium">{paiseToInr(order.totalPaise)}</p><p className="mt-1 text-[var(--muted)]">Payment {order.paymentStatus.toLowerCase()}</p></div>
          </Link>)}
        </div> : <p className="mt-4 text-sm text-[var(--muted)]">Your orders will appear here after checkout.</p>}
      </section>
    </div>
  );
}
