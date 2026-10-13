"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Banner = { id: string; title: string; subtitle: string | null; imageUrl: string | null; href: string | null; slot: string; sortOrder: number; enabled: boolean; startsAt: string | null; endsAt: string | null };
const slots = ["hero", "new-arrivals", "wedding-season", "festive", "mens-fashion", "womens-fashion", "kids-fashion", "sarees", "suiting"];

export function BannerManager({ initialBanners }: { initialBanners: Banner[] }) {
  const [banners, setBanners] = useState(initialBanners);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function create(form: FormData) {
    setBusy(true); setMessage("");
    const rawDate = (key: string) => { const value = String(form.get(key) ?? ""); if (!value) return null; const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date.toISOString(); };
    try {
      const response = await fetch("/api/owner/banners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: String(form.get("title") ?? ""), subtitle: String(form.get("subtitle") ?? "") || null, imageUrl: String(form.get("imageUrl") ?? "") || null, href: String(form.get("href") ?? "") || null, slot: String(form.get("slot") ?? "hero"), sortOrder: Number(form.get("sortOrder") ?? 0), startsAt: rawDate("startsAt"), endsAt: rawDate("endsAt") }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Banner could not be saved.");
      setBanners((current) => [data.banner, ...current]); setMessage("Banner created."); (document.getElementById("banner-form") as HTMLFormElement | null)?.reset(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Banner could not be saved."); }
    finally { setBusy(false); }
  }
  async function toggle(banner: Banner) {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/owner/banners/${banner.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !banner.enabled }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Banner could not be updated."); setBanners((current) => current.map((item) => item.id === banner.id ? { ...item, enabled: !item.enabled } : item)); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Banner could not be updated."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-7">
    <section><h2 className="mb-3 font-serif text-xl">Create a banner</h2><form id="banner-form" action={create} className="card-nrf grid gap-4 p-5 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Headline<input name="title" className="input-nrf" required maxLength={120} /></label><label className="grid gap-1 text-sm">Placement<select name="slot" className="input-nrf">{slots.map((slot) => <option key={slot}>{slot}</option>)}</select></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Supporting text<input name="subtitle" className="input-nrf" maxLength={300} /></label><label className="grid gap-1 text-sm sm:col-span-2">Image URL (optional)<input name="imageUrl" type="url" className="input-nrf" placeholder="https://…" /></label><label className="grid gap-1 text-sm sm:col-span-2">Destination path or HTTPS URL<input name="href" className="input-nrf" placeholder="/shop" /></label>
      <label className="grid gap-1 text-sm">Display order<input name="sortOrder" type="number" min="0" max="10000" defaultValue="0" className="input-nrf" /></label><label className="grid gap-1 text-sm">Starts at<input name="startsAt" type="datetime-local" className="input-nrf" /></label><label className="grid gap-1 text-sm">Ends at<input name="endsAt" type="datetime-local" className="input-nrf" /></label>
      <div className="flex items-center gap-3 sm:col-span-2"><button className="btn-primary" disabled={busy}>Create banner</button>{message ? <p role="status" className="text-sm text-[var(--muted)]">{message}</p> : null}</div>
    </form></section>
    <section><h2 className="mb-3 font-serif text-xl">Current banners</h2>{banners.length ? <div className="grid gap-3">{banners.map((banner) => <article key={banner.id} className="card-nrf flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="font-medium">{banner.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{banner.slot} · order {banner.sortOrder}{banner.href ? ` · ${banner.href}` : ""}</p><p className="mt-1 text-xs text-[var(--muted)]">{banner.enabled ? "Enabled" : "Disabled"}{banner.startsAt ? ` · from ${new Date(banner.startsAt).toLocaleString("en-IN", { dateStyle: "short", timeZone: "Asia/Kolkata" })}` : ""}{banner.endsAt ? ` · until ${new Date(banner.endsAt).toLocaleString("en-IN", { dateStyle: "short", timeZone: "Asia/Kolkata" })}` : ""}</p></div><button type="button" disabled={busy} onClick={() => void toggle(banner)} className={banner.enabled ? "btn-secondary" : "btn-primary"}>{banner.enabled ? "Disable" : "Enable"}</button></article>)}</div> : <p className="card-nrf p-6 text-sm text-[var(--muted)]">No configured banners yet.</p>}</section>
  </div>;
}
