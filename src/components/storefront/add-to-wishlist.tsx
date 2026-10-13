"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddToWishlist({ variantId }: { variantId?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!variantId) return;
    setBusy(true); setMessage(null);
    const response = await fetch("/api/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.status === 401) { router.push("/auth/login?next=%2Faccount%2Fwishlist"); return; }
    if (!response.ok) { setMessage(data.error ?? "Could not save this item."); return; }
    setMessage("Saved to wishlist.");
  }
  return <div className="flex items-center gap-2"><button type="button" aria-label="Add to wishlist" title="Add to wishlist" disabled={busy || !variantId} onClick={add} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-[var(--bg)]/95 text-maroon-700 hover:bg-cream-100 disabled:opacity-50 dark:border-stone-700"><Heart aria-hidden="true" size={18} /></button>{message && <span aria-live="polite" className="max-w-36 rounded bg-[var(--bg)]/95 px-2 py-1 text-xs shadow">{message}</span>}</div>;
}
