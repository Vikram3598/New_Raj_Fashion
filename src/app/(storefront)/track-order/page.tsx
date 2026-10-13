import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Track an order" };

export default async function TrackOrderPage() {
  const user = await getSessionUser();
  return <div className="container-nrf py-16"><div className="card-nrf mx-auto max-w-xl p-6 text-center sm:p-10"><h1 className="font-serif text-4xl">Track your order</h1><p className="mt-3 text-sm text-[var(--muted)]">Sign in to view delivery updates and payment details for your orders.</p><Link className="btn-primary mt-6" href={user ? "/account/orders" : "/auth/login?next=/account/orders"}>{user ? "View my orders" : "Sign in securely"}</Link></div></div>;
}
