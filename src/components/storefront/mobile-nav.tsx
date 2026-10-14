"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LocaleSwitcher } from "@/i18n/locale-provider";
import { ThemeToggle } from "@/components/theme-toggle";

type Cat = { id: string; name: string; slug: string; children: { id: string; name: string; slug: string }[] };

export function MobileNav({ categories }: { categories: Cat[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full" aria-label="Open menu" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/40" role="dialog" aria-modal="true">
          <div className="h-full w-[min(100%,20rem)] bg-[var(--bg)] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-serif text-xl">Menu</p>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
            <nav className="grid gap-2 text-sm">
              {categories.map((c) => (
                <Link key={c.id} href={`/category/${c.slug}`} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 hover:bg-cream-100 dark:hover:bg-stone-800">
                  {c.name}
                </Link>
              ))}
              <Link href="/store-visit" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 font-medium text-maroon-700">
                Plan Your Store Visit
              </Link>
              <Link href="/shop" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 font-medium">
                All products
              </Link>
              <Link href="/about" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2">
                About
              </Link>
              <Link href="/contact" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2">
                Contact
              </Link>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
