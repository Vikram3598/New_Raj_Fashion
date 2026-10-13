"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function OrderStatusControl({ orderId, status, allowed }: { orderId: string; status: string; allowed: string[] }) {
  const router = useRouter();
  const [next, setNext] = useState(allowed[0] ?? "");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const showShipmentFields = ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(next);

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!next) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/shopkeeper/orders/${orderId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next, carrier, trackingNumber }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update order.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update order."); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs text-[var(--muted)]">{status.replaceAll("_", " ")}</span>
    {allowed.length > 0 && <form onSubmit={update} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-[11px]"><span>Next status</span><select aria-label="Next fulfilment status" value={next} onChange={(event) => setNext(event.target.value)} className="input-nrf w-auto py-1 text-xs">{allowed.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      {showShipmentFields && <>
        <label className="grid gap-1 text-[11px]"><span>Carrier or pickup</span><input value={carrier} onChange={(event) => setCarrier(event.target.value)} maxLength={120} className="input-nrf w-36 py-1 text-xs" placeholder="Optional"/></label>
        <label className="grid gap-1 text-[11px]"><span>Tracking number</span><input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} maxLength={120} className="input-nrf w-36 py-1 text-xs" placeholder="Optional"/></label>
      </>}
      <button type="submit" disabled={busy} className="btn-secondary min-h-8 rounded-lg px-3 py-1 text-xs">{busy ? "Saving…" : "Update"}</button>
    </form>}
    {error && <span role="alert" className="basis-full text-xs text-red-700">{error}</span>}
  </div>;
}
