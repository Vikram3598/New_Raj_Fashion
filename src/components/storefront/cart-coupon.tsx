"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CartCoupon({ initialCode }: { initialCode: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const response = await fetch("/api/cart/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "This coupon could not be applied.");
    router.refresh();
  }
  async function remove() {
    setBusy(true); setError(null);
    const response = await fetch("/api/cart/coupon", { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "This coupon could not be removed.");
    setCode(""); router.refresh();
  }
  return <form onSubmit={submit} className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-800"><label className="text-sm font-medium" htmlFor="coupon-code">Coupon code</label><div className="mt-2 flex gap-2"><input id="coupon-code" className="input-nrf min-w-0" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={40} autoComplete="off" /><button disabled={busy || !code.trim()} className="btn-secondary">{busy ? "Saving…" : "Apply"}</button></div>{initialCode && <button type="button" disabled={busy} onClick={remove} className="mt-2 text-sm text-maroon-700 underline">Remove {initialCode}</button>}{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</form>;
}
