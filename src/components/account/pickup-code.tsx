"use client";

import { useState } from "react";
export function PickupCode({ orderId }: { orderId: string }) {
  const [code, setCode] = useState(""); const [expiresAt, setExpiresAt] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function requestCode() {
    setBusy(true); setError(""); setCode("");
    try { const response = await fetch(`/api/account/orders/${orderId}/pickup-code`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not issue a pickup code."); setCode(data.code); setExpiresAt(data.expiresAt); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not issue a pickup code."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700"><p className="text-sm text-[var(--muted)]">Generate this one-time code after your order is ready. Show it to the assigned store staff at collection. It expires after 30 minutes and is invalidated after handover.</p><button type="button" className="btn-primary mt-3" onClick={() => void requestCode()} disabled={busy}>{busy ? "Generating…" : code ? "Generate a new code" : "Get pickup code"}</button>{error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}{code ? <div className="mt-4 rounded-xl border border-gold-500 bg-gold-50 p-4 text-center dark:bg-stone-800"><p className="text-xs uppercase tracking-wider">One-time pickup code</p><p className="mt-2 font-mono text-3xl font-bold tracking-[.35em]">{code}</p><p className="mt-2 text-xs text-[var(--muted)]">Expires {new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(expiresAt))}</p></div> : null}</div>;
}
