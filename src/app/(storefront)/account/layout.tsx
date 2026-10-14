import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/account/sign-out-button";

const links = [
  ["/account", "Overview"],
  ["/account/orders", "Orders"],
  ["/account/store-visits", "My store visits"],
  ["/account/profile", "Profile"],
  ["/account/addresses", "Addresses"],
  ["/account/wishlist", "Wishlist"],
  ["/account/preferences", "Preferences"],
  ["/account/security", "Security"],
  ["/account/sessions", "Sessions"],
] as const;

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");
  if (!user.mfaSatisfied) redirect("/auth/mfa/verify?next=%2Faccount");

  return (
    <div className="container-nrf py-8 sm:py-10">
      <div className="mb-6">
        <p className="text-sm text-[var(--muted)]">Customer account</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Welcome, {user.username}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Account navigation" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-xl border border-stone-200 px-4 py-2.5 text-sm hover:border-maroon-700 hover:text-maroon-700 dark:border-stone-700">
              {label}
            </Link>
          ))}
          <SignOutButton />
        </nav>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
