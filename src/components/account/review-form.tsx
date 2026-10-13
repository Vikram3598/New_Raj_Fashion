"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewForm({ orderId, productId, productName, submitted }: { orderId: string; productId: string; productName: string; submitted: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState(submitted ? "Your review is awaiting approval." : "");
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, productId, rating: Number(form.get("rating")), title: String(form.get("title") ?? ""), body: String(form.get("body") ?? "") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Review could not be submitted.");
      setMessage("Your review is awaiting approval."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review could not be submitted."); }
    finally { setBusy(false); }
  }
  return <form action={submit} className="mt-3 grid gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
    <strong className="text-sm">{productName}</strong>
    {submitted ? <p className="text-sm text-[var(--muted)]">Review submitted for moderation.</p> : <>
      <label className="grid gap-1 text-xs">Rating<select name="rating" className="input-nrf" defaultValue="5"><option value="5">5 · Excellent</option><option value="4">4 · Good</option><option value="3">3 · Fair</option><option value="2">2 · Poor</option><option value="1">1 · Very poor</option></select></label>
      <label className="grid gap-1 text-xs">Title (optional)<input name="title" maxLength={120} className="input-nrf"/></label>
      <label className="grid gap-1 text-xs">Your review<textarea name="body" minLength={10} maxLength={2000} required className="input-nrf min-h-24"/></label>
      <button className="btn-secondary w-fit" disabled={busy}>{busy ? "Submitting…" : "Submit review"}</button>
    </>}
    {message && <p aria-live="polite" className="text-xs text-[var(--muted)]">{message}</p>}
  </form>;
}
