import Link from "next/link";
import { getStoreSettings } from "@/lib/store";

export async function Footer() {
  const settings = await getStoreSettings();
  return (
    <footer className="mt-16 border-t border-stone-200 bg-cream-100 dark:border-stone-800 dark:bg-stone-950">
      <div className="container-nrf grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-serif text-2xl">{settings?.storeName ?? "New Raj Fashion"}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {settings?.address}, {settings?.city}, {settings?.state} {settings?.postalCode}
          </p>
          {settings?.phone ? <p className="mt-2 text-sm">Phone: {settings.phone}</p> : <p className="mt-2 text-sm text-[var(--muted)]">Phone number is not published yet.</p>}
          {settings?.email ? <p className="text-sm">Email: {settings.email}</p> : <p className="text-sm text-[var(--muted)]">Email address is not published yet.</p>}
        </div>
        <div>
          <p className="font-medium">Shop</p>
          <ul className="mt-3 grid gap-2 text-sm">
            <li><Link href="/shop">All products</Link></li>
            <li><Link href="/collections/wedding">Wedding collection</Link></li>
            <li><Link href="/store-visit">Plan Your Store Visit</Link></li>
            <li><Link href="/track-order">Track order</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-medium">Policies</p>
          <ul className="mt-3 grid gap-2 text-sm">
            <li><Link href="/privacy-policy">Privacy policy</Link></li>
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/shipping-policy">Shipping policy</Link></li>
            <li><Link href="/return-refund-policy">Return & refund</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-medium">Help</p>
          <ul className="mt-3 grid gap-2 text-sm">
            <li><Link href="/faq">FAQ</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/about">About the store</Link></li>
            <li><Link href="/shopkeeper/login">Shopkeeper portal</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-stone-200 py-4 text-center text-xs text-[var(--muted)] dark:border-stone-800">
        Prices in Indian rupees (₹). Times shown in Asia/Kolkata.
      </p>
    </footer>
  );
}
