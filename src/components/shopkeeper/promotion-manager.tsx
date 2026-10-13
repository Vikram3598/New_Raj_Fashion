"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Coupon = { id: string; code: string; description: string | null; percentOff: number | null; amountOffPaise: number | null; minSubtotalPaise: number | null; maxUses: number | null; usedCount: number; startsAt: string | null; endsAt: string | null; active: boolean };
const dateInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";

export function PromotionManager({ initialCoupons }: { initialCoupons: Coupon[] }) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function create(form: FormData) {
    setMessage(""); setBusyId("create");
    const amount = String(form.get("amountOffRupees") ?? "");
    const percent = String(form.get("percentOff") ?? "");
    const dateValue = (key: string) => { const value = String(form.get(key) ?? ""); if (!value) return null; const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date.toISOString(); };
    const payload = {
      code: String(form.get("code") ?? ""), description: String(form.get("description") ?? "") || null,
      percentOff: percent ? Number(percent) : null, amountOffRupees: amount ? Number(amount) : null,
      minSubtotalRupees: String(form.get("minSubtotalRupees") ?? "") ? Number(form.get("minSubtotalRupees")) : null,
      maxUses: String(form.get("maxUses") ?? "") ? Number(form.get("maxUses")) : null,
      startsAt: dateValue("startsAt"), endsAt: dateValue("endsAt"),
    };
    try {
      const response = await fetch("/api/owner/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Promotion could not be saved.");
      setCoupons((current) => [data.coupon, ...current]); setMessage("Promotion created."); (document.getElementById("promotion-create-form") as HTMLFormElement | null)?.reset(); router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Promotion could not be saved."); }
    finally { setBusyId(""); }
  }

  async function setActive(coupon: Coupon) {
    setBusyId(coupon.id); setMessage("");
    try {
      const response = await fetch(`/api/owner/promotions/${coupon.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !coupon.active }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Promotion could not be updated.");
      setCoupons((current) => current.map((item) => item.id === coupon.id ? { ...item, active: !item.active } : item)); router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Promotion could not be updated."); }
    finally { setBusyId(""); }
  }

  return <div className="grid gap-7">
    <section><h2 className="mb-3 font-serif text-xl">Create a coupon</h2><form id="promotion-create-form" action={create} className="card-nrf grid gap-4 p-5 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Code<input name="code" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" className="input-nrf" placeholder="FESTIVE10" /></label>
      <label className="grid gap-1 text-sm">Short description<input name="description" maxLength={240} className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">Percent off<input name="percentOff" type="number" min="1" max="90" className="input-nrf" placeholder="Leave blank for fixed amount" /></label>
      <label className="grid gap-1 text-sm">Fixed amount off (₹)<input name="amountOffRupees" type="number" min="0.01" step="0.01" className="input-nrf" placeholder="Leave blank for percent" /></label>
      <label className="grid gap-1 text-sm">Minimum basket (₹)<input name="minSubtotalRupees" type="number" min="0" step="0.01" className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">Maximum redemptions<input name="maxUses" type="number" min="1" step="1" className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">Starts at<input name="startsAt" type="datetime-local" className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">Ends at<input name="endsAt" type="datetime-local" className="input-nrf" /></label>
      <div className="flex items-center gap-3 sm:col-span-2"><button className="btn-primary" disabled={busyId === "create"}>{busyId === "create" ? "Creating…" : "Create promotion"}</button>{message ? <p role="status" className="text-sm text-[var(--muted)]">{message}</p> : null}</div>
    </form></section>
    <section><h2 className="mb-3 font-serif text-xl">Coupons</h2>{coupons.length ? <div className="grid gap-3">{coupons.map((coupon) => <article key={coupon.id} className="card-nrf flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="font-semibold tracking-wide">{coupon.code}</p><p className="mt-1 text-sm text-[var(--muted)]">{coupon.percentOff ? `${coupon.percentOff}% off` : `₹${((coupon.amountOffPaise ?? 0) / 100).toLocaleString("en-IN")} off`}{coupon.minSubtotalPaise ? ` · min ₹${(coupon.minSubtotalPaise / 100).toLocaleString("en-IN")}` : ""}</p><p className="mt-1 text-xs text-[var(--muted)]">Used {coupon.usedCount}{coupon.maxUses ? ` / ${coupon.maxUses}` : ""}{coupon.startsAt ? ` · starts ${dateInput(coupon.startsAt).replace("T", " ")}` : ""}{coupon.endsAt ? ` · ends ${dateInput(coupon.endsAt).replace("T", " ")}` : ""}</p></div><button type="button" disabled={busyId === coupon.id} onClick={() => void setActive(coupon)} className={coupon.active ? "btn-secondary" : "btn-primary"}>{busyId === coupon.id ? "Saving…" : coupon.active ? "Deactivate" : "Activate"}</button></article>)}</div> : <p className="card-nrf p-6 text-sm text-[var(--muted)]">No coupon codes yet.</p>}</section>
  </div>;
}
