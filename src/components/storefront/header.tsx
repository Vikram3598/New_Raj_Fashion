import Link from "next/link";
import { Heart, ShoppingBag, UserRound, Menu } from "lucide-react";
import { getNavCategories, getStoreSettings } from "@/lib/store";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchBox } from "@/components/storefront/search-box";
import { MobileNav } from "@/components/storefront/mobile-nav";
import { LocaleSwitcher } from "@/i18n/locale-provider";

export async function Header() {
  const [settings, categories, user] = await Promise.all([
    getStoreSettings(),
    getNavCategories(),
    getSessionUser(),
  ]);
  let cartCount = 0;
  if (user) {
    const cart = await prisma.cart.findFirst({
      where: { userId: user.id },
      include: { items: true },
    });
    cartCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  }
  const name = settings?.storeName ?? "New Raj Fashion";

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[var(--bg)]/95 backdrop-blur dark:border-stone-800">
      <div className="container-nrf flex items-center gap-3 py-3">
        <MobileNav categories={categories} />
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-maroon-700 font-serif text-lg text-gold-100">
            R
          </span>
          <span className="truncate font-serif text-xl font-semibold leading-tight sm:text-2xl">{name}</span>
        </Link>
        <div className="hidden flex-1 md:block">
          <SearchBox />
        </div>
        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/track-order" className="hidden rounded-full px-3 py-2 text-sm hover:bg-cream-100 dark:hover:bg-stone-800 lg:inline">
            Track order
          </Link>
          <Link href="/account/wishlist" aria-label="Wishlist" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-100 dark:hover:bg-stone-800">
            <Heart className="h-5 w-5" />
          </Link>
          <Link href="/cart" aria-label={`Shopping cart, ${cartCount} items`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-100 dark:hover:bg-stone-800">
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-maroon-700 px-1 text-center text-[11px] text-white">
                {cartCount}
              </span>
            ) : null}
          </Link>
          {user ? (
            <Link href="/account" className="inline-flex h-10 items-center gap-1 rounded-full px-2 hover:bg-cream-100 dark:hover:bg-stone-800">
              <UserRound className="h-5 w-5" />
              <span className="hidden text-sm sm:inline">{user.username}</span>
            </Link>
          ) : (
            <Link href="/auth/login" className="btn-primary hidden !min-h-10 !px-4 sm:inline-flex">
              Login / Sign up
            </Link>
          )}
          <span className="hidden sm:inline-flex"><LocaleSwitcher compact /></span>
          <ThemeToggle />
        </nav>
      </div>
      <div className="hidden border-t border-stone-200/70 dark:border-stone-800 md:block">
        <nav className="container-nrf flex gap-4 overflow-x-auto py-2 text-sm" aria-label="Product categories">
          {categories.map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="whitespace-nowrap hover:text-maroon-700">
              {c.name}
            </Link>
          ))}
          <Link href="/store-visit" className="whitespace-nowrap font-medium text-maroon-700">Plan Your Store Visit</Link>
          <Link href="/shop" className="whitespace-nowrap font-medium text-maroon-700">
            All products
          </Link>
        </nav>
      </div>
      <div className="container-nrf pb-3 md:hidden">
        <SearchBox />
      </div>
    </header>
  );
}

export { Menu };
