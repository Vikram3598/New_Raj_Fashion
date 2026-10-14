"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/locale-provider";
import { ResilientImage } from "@/components/storefront/resilient-image";

type Visit = { id: string; reference: string; customerName: string; phone: string; email: string | null; purpose: string; status: string; internalNotes: string | null; referenceImageUrl: string | null; totalBudgetPaise: number | null; preferences: string | null; slot: { startsAt: string }; assignedStaff: { id: string; username: string } | null; items: { id: string; productName: string; sku: string | null; category: string | null; imageUrl: string | null; size: string | null; colour: string | null; quantity: number; instructions: string | null }[]; tasks: { label: string; completed: boolean }[]; history: { toStatus: string; note: string | null; createdAt: string }[] };
type Staff = { id: string; username: string };
const statuses = ["PENDING", "CONFIRMED", "PREPARING", "READY", "ARRIVED", "COMPLETED", "CANCELLED", "MISSED"];
export function OwnerStoreVisits() {
  const { locale } = useLocale();
  const [visits, setVisits] = useState<Visit[]>([]); const [staff, setStaff] = useState<Staff[]>([]); const [busy, setBusy] = useState<string | null>(null); const [message, setMessage] = useState(""); const [query, setQuery] = useState("");
  const T = (en: string, hi: string) => locale === "hi" ? hi : en;
  async function refresh() { const response = await fetch("/api/owner/store-visits"); const data = await response.json(); if (response.ok) { setVisits(data.visits ?? []); setStaff(data.staff ?? []); } else setMessage(data.error ?? "Unable to load visits."); }
  useEffect(() => { void refresh(); }, []);
  async function save(id: string, form: HTMLFormElement) {
    const values = new FormData(form); setBusy(id); setMessage("");
    try {
      const response = await fetch(`/api/owner/store-visits/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: values.get("status"), assignedStaffId: values.get("assignedStaffId") || null, internalNotes: values.get("internalNotes") || null, outcome: values.get("outcome") || null, date: values.get("date") || undefined, time: values.get("time") || undefined }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? T("Update failed.", "अपडेट विफल हुआ।"));
      setMessage(T("Visit updated.", "विज़िट अपडेट हुई।")); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : T("Update failed.", "अपडेट विफल हुआ।")); }
    finally { setBusy(null); }
  }
  const filtered = visits.filter((visit) => `${visit.reference} ${visit.customerName} ${visit.phone}`.toLowerCase().includes(query.toLowerCase()));
  const counts = statuses.map((status) => [status, visits.filter((visit) => visit.status === status).length] as const);
  return <div className="container-nrf py-9">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-maroon-700">Owner console</p><h1 className="mt-2 font-serif text-4xl">{T("Store visit management", "दुकान विज़िट प्रबंधन")}</h1><p className="mt-2 text-sm text-[var(--muted)]">{T("Requested appointments remain unconfirmed until capacity and preparation are reviewed.", "क्षमता और तैयारी जाँचने के बाद ही अनुरोधित समय की पुष्टि करें।")}</p></div><a href="/shopkeeper/owner/store-visits/calendar" className="btn-secondary">{T("Manage time slots", "समय स्लॉट प्रबंधित करें")}</a></div>
    <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">{counts.map(([status, count]) => <div key={status} className="card-nrf p-3"><p className="text-[10px] text-[var(--muted)]">{status}</p><strong className="font-serif text-2xl">{count}</strong></div>)}</div>
    <label className="mt-6 grid max-w-md gap-1 text-sm">{T("Search by reference, customer or phone", "संदर्भ, ग्राहक या फ़ोन से खोजें")}<input value={query} onChange={(event) => setQuery(event.target.value)} className="input-nrf" /></label>
    {message ? <p role="status" className="mt-4 text-sm text-maroon-700">{message}</p> : null}
    <div className="mt-5 grid gap-5">{filtered.map((visit) => <article key={visit.id} className="card-nrf p-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-maroon-700">{visit.reference}</p><h2 className="mt-1 font-serif text-2xl">{visit.customerName}</h2><p className="text-sm text-[var(--muted)]">{visit.phone}{visit.email ? ` · ${visit.email}` : ""}</p></div><div className="text-right"><p className="font-medium">{new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(visit.slot.startsAt))}</p><p className="mt-1 text-sm">{visit.status}</p></div></div>
      {visit.referenceImageUrl ? <div className="relative mt-4 aspect-[3/1] max-w-lg overflow-hidden rounded-xl"><ResilientImage src={visit.referenceImageUrl} alt={T("Customer reference image", "ग्राहक का संदर्भ चित्र")} fill sizes="(max-width: 640px) 100vw, 512px" unoptimized className="object-cover" /></div> : null}
      <div className="mt-4 grid gap-2 md:grid-cols-2">{visit.items.map((item) => <div key={item.id} className="rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-800">{item.imageUrl ? <div className="relative mb-2 aspect-[3/2] overflow-hidden rounded-lg"><ResilientImage src={item.imageUrl} alt={item.productName} fill sizes="(max-width: 640px) 100vw, 400px" unoptimized className="object-cover" /></div> : null}<strong>{item.productName}</strong>{item.sku ? <span className="ml-2 text-xs text-[var(--muted)]">{item.sku}</span> : null}<p className="mt-1">{T("Qty", "मात्रा")}: {item.quantity}{item.size ? ` · ${T("Size", "साइज़")}: ${item.size}` : ""}{item.colour ? ` · ${T("Colour", "रंग")}: ${item.colour}` : ""}</p>{item.instructions ? <p>{item.instructions}</p> : null}</div>)}</div>
      <p className="mt-3 text-xs text-[var(--muted)]">{T("Preparation", "तैयारी")}: {visit.tasks.filter((task) => task.completed).length}/{visit.tasks.length} · {T("Budget", "बजट")}: {visit.totalBudgetPaise == null ? T("Not provided", "नहीं दिया") : new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(visit.totalBudgetPaise / 100)}</p>
      <form className="mt-4 grid gap-3 border-t border-stone-200 pt-4 dark:border-stone-700 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(visit.id, event.currentTarget); }}>
        <label className="grid gap-1 text-sm">{T("Status", "स्थिति")}<select name="status" defaultValue={visit.status} className="input-nrf">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{T("Assigned staff", "जिम्मेदार स्टाफ")}<select name="assignedStaffId" defaultValue={visit.assignedStaff?.id ?? ""} className="input-nrf"><option value="">{T("Unassigned", "नियुक्त नहीं")}</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{T("New arrival date", "नई आगमन तारीख")}<input name="date" type="date" className="input-nrf" /></label>
        <label className="grid gap-1 text-sm">{T("New arrival time", "नया आगमन समय")}<input name="time" type="time" step={3600} className="input-nrf" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">{T("Internal notes (not shown to customer)", "आंतरिक नोट (ग्राहक को नहीं दिखेगा)")}<textarea name="internalNotes" defaultValue={visit.internalNotes ?? ""} rows={2} maxLength={5000} className="input-nrf" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">{T("Visit outcome", "विज़िट का परिणाम")}<textarea name="outcome" rows={2} maxLength={2000} className="input-nrf" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy === visit.id} className="btn-primary !min-h-9 !px-4">{busy === visit.id ? T("Saving…", "सहेजा जा रहा है…") : T("Save changes", "बदलाव सहेजें")}</button><button type="button" onClick={() => window.print()} className="btn-secondary !min-h-9 !px-4">{T("Print proforma", "प्रपत्र प्रिंट करें")}</button></div>
      </form>
    </article>)}</div>
  </div>;
}
