"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { paiseToInr } from "@/lib/money";

export type WishlistEntry = {
  variantId: string; title: string; pricePaise: number; stockAvailable: number; productStatus: string;
  productName: string; productSlug: string; imageUrl: string | null; imageAlt: string | null;
};

export function WishlistManager({ initialItems }: { initialItems: WishlistEntry[] }) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function remove(variantId: string) {
    setBusyId(variantId); setMessage("");
    try {
      const response = await fetch("/api/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update wishlist.");
      setItems((current) => current.filter((item) => item.variantId !== variantId)); setMessage("Removed from wishlist.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update wishlist."); }
    finally { setBusyId(null); }
  }

  return <div className="grid gap-4">
    {message ? <p role="status" className="text-sm text-[var(--muted)]">{message}</p> : null}
    {items.length ? items.map((item) => <article key={item.variantId} className="flex gap-4 rounded-xl border border-stone-200 p-3 dark:border-stone-700 sm:p-4">
      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-cream-100 dark:bg-stone-800">{item.imageUrl ? <Image fill sizes="80px" unoptimized className="object-cover" src={item.imageUrl} alt={item.imageAlt || item.productName} /> : null}</div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0"><p className="text-xs text-[var(--muted)]">{item.title}</p><h3 className="mt-1 truncate font-medium">{item.productStatus === "PUBLISHED" ? <Link className="hover:text-maroon-700" href={`/product/${item.productSlug}`}>{item.productName}</Link> : item.productName}</h3><p className="mt-1 text-sm">{paiseToInr(item.pricePaise)}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.productStatus === "PUBLISHED" && item.stockAvailable > 0 ? "Available" : "Currently unavailable"}</p></div>
        <button type="button" disabled={busyId === item.variantId} className="self-start text-sm text-red-700 disabled:opacity-50 sm:self-center" onClick={() => void remove(item.variantId)}>{busyId === item.variantId ? "Removing…" : "Remove"}</button>
      </div>
    </article>) : <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center dark:border-stone-700"><p className="text-sm text-[var(--muted)]">Your wishlist is empty.</p><Link href="/shop" className="btn-primary mt-4">Explore products</Link></div>}
  </div>;
}
