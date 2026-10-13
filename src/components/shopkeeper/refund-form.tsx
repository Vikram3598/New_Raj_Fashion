"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefundForm({ orderId, totalPaise }: { orderId: string; totalPaise: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState((totalPaise / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null); setError(null);
    const idempotencyKey = requestKey ?? crypto.randomUUID();
    setRequestKey(idempotencyKey);
    try {
      const response = await fetch(`/api/owner/orders/${orderId}/refunds`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey: idempotencyKey, amountRupees: Number(amount), reason }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setRequestKey(null); setError(data.error ?? "Refund could not be started."); return; }
      setMessage(`Refund request status: ${data.refund?.status ?? "REQUESTED"}. Check the refund list for provider updates.`);
      if (data.refund?.providerRefundId) setRequestKey(null);
      router.refresh();
    } catch {
      setError("The response was interrupted. Retry this same request to safely check its provider status.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-stone-200 pt-4 dark:border-stone-800 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-xs">Refund amount (₹)<input className="input-nrf mt-1" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || Boolean(requestKey)} required /></label><label className="text-xs">Reason<input className="input-nrf mt-1" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={busy || Boolean(requestKey)} /></label><button className="btn-secondary" disabled={busy}>{busy ? "Submitting…" : requestKey ? "Retry same request" : "Start refund"}</button>{message && <p className="text-xs sm:col-span-3">{message}</p>}{error && <p role="alert" className="text-xs text-red-700 sm:col-span-3">{error}</p>}</form>;
}
