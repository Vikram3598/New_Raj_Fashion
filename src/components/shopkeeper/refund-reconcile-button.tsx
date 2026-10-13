"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefundReconcileButton({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reconcile() {
    setBusy(true); setMessage(null);
    const response = await fetch(`/api/owner/refunds/${refundId}/reconcile`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? `Provider status: ${data.status}.` : data.error ?? "Could not reconcile.");
    if (response.ok) router.refresh();
  }
  return <div className="mt-2"><button type="button" disabled={busy} onClick={reconcile} className="text-xs text-maroon-700 underline">{busy ? "Checking…" : "Check provider status"}</button>{message && <p className="mt-1 text-xs text-[var(--muted)]">{message}</p>}</div>;
}
