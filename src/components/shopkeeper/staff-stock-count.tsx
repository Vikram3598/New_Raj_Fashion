"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StaffStockCount({ variantId, stockOnHand, stockReserved }: { variantId: string; stockOnHand: number; stockReserved: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/shopkeeper/inventory/${variantId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stockOnHand: Number(form.get("stockOnHand")), note: form.get("note") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Count could not be saved.");
      setMessage("Count recorded."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Count could not be saved."); }
    finally { setBusy(false); }
  }
  return <form action={submit} className="mt-2 flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs">Record count<input name="stockOnHand" type="number" required min={stockReserved} max={100000} defaultValue={stockOnHand} className="input-nrf w-32"/></label><label className="grid gap-1 text-xs">Reason<input name="note" required minLength={3} maxLength={300} placeholder="Count correction" className="input-nrf w-48"/></label><button className="btn-secondary" disabled={busy}>{busy ? "Saving…" : "Record count"}</button>{message && <span aria-live="polite" className="text-xs text-[var(--muted)]">{message}</span>}</form>;
}
