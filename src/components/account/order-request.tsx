"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderRequest({ orderId, canCancel, canReturn }: { orderId: string; canCancel: boolean; canReturn: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!canCancel && !canReturn) return null;
  async function submit(type: "cancel" | "return") {
    setBusy(true); setError(null); setMessage(null);
    const response = await fetch(`/api/account/orders/${orderId}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, reason }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "The request could not be saved.");
    setMessage(type === "cancel" ? "Cancellation request sent. The store will review it." : "Return request sent. The store will review it.");
    router.refresh();
  }
  return <section className="card-nrf p-5"><h3 className="font-serif text-xl">Order request</h3><p className="mt-2 text-sm text-[var(--muted)]">Add an optional note for the store. Your request does not confirm a cancellation or refund; the store reviews it first.</p>
    <label className="mt-3 block text-sm">Note<textarea className="input-nrf mt-1 min-h-20" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <div className="mt-3 flex flex-wrap gap-2">{canCancel && <button type="button" disabled={busy} onClick={() => submit("cancel")} className="btn-secondary">Request cancellation</button>}{canReturn && <button type="button" disabled={busy} onClick={() => submit("return")} className="btn-secondary">Request return</button>}</div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-3 text-sm">{message}</p>}
  </section>;
}
