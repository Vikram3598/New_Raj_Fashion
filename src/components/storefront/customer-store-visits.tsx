"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/locale-provider";

type Visit = { id: string; reference: string; customerName: string; status: string; purpose: string; totalBudgetPaise: number | null; preferences: string | null; slot: { startsAt: string }; items: { id: string; productName: string; quantity: number; size: string | null; colour: string | null; instructions: string | null }[]; tasks: { id: string; label: string; completed: boolean }[] };
export function CustomerStoreVisits() {
  const { locale } = useLocale();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [date, setDate] = useState(""); const [time, setTime] = useState(""); const [slots, setSlots] = useState<{ time: string; available: number }[]>([]);
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true);
  const T = (en: string, hi: string) => locale === "hi" ? hi : en;
  async function refresh() { setLoading(true); try { const response = await fetch("/api/store-visits"); const data = await response.json(); setVisits(data.visits ?? []); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    void fetch(`/api/store-visits/availability?date=${date}&kind=VISIT`)
      .then((response) => response.json())
      .then((data) => setSlots((data.slots ?? []).filter((slot: { available: number; closed: boolean }) => slot.available > 0 && !slot.closed)))
      .catch(() => setSlots([]));
  }, [date]);
  async function change(visitId: string, action: "cancel" | "reschedule") {
    setMessage("");
    const response = await fetch(`/api/account/store-visits/${visitId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, date, time }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? T("Could not update this request.", "अनुरोध अपडेट नहीं हुआ।")); return; }
    setMessage(action === "cancel" ? T("The request was cancelled.", "अनुरोध रद्द कर दिया गया।") : T("Your new time was requested. The store will confirm it.", "नए समय का अनुरोध भेजा गया है। दुकान इसकी पुष्टि करेगी।"));
    await refresh();
  }
  if (loading) return <p>{T("Loading your store visits…", "आपकी दुकान बुकिंग लोड हो रही है…")}</p>;
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-3xl">{T("My store visits", "मेरी दुकान बुकिंग")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{T("Review requested times and preparation progress.", "अनुरोधित समय और तैयारी की स्थिति देखें।")}</p></div><a className="btn-primary" href="/store-visit">{T("Plan another visit", "एक और विज़िट की योजना बनाएँ")}</a></div>
    {message ? <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{message}</p> : null}
    {!visits.length ? <div className="card-nrf p-8 text-center text-sm text-[var(--muted)]">{T("You have no store visit requests yet.", "अभी तक आपने दुकान आने का कोई अनुरोध नहीं भेजा है।")}</div> : visits.map((visit) => {
      const start = new Date(visit.slot.startsAt);
      const canChange = ["PENDING", "CONFIRMED"].includes(visit.status) && start.getTime() > Date.now() + 2 * 3600000;
      return <article key={visit.id} className="card-nrf p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-maroon-700">{visit.reference}</p><h3 className="mt-1 font-serif text-2xl">{new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(start)}</h3></div><span className="rounded-full border border-gold-500 px-3 py-1 text-sm">{visit.status}</span></div>
        <ul className="mt-4 grid gap-2 text-sm">{visit.items.map((item) => <li key={item.id} className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800"><strong>{item.productName}</strong> × {item.quantity}{item.size ? ` · ${T("Size", "साइज़")}: ${item.size}` : ""}{item.colour ? ` · ${T("Colour", "रंग")}: ${item.colour}` : ""}{item.instructions ? <p className="mt-1 text-[var(--muted)]">{item.instructions}</p> : null}</li>)}</ul>
        {visit.tasks.length ? <div className="mt-4"><p className="text-sm font-medium">{T("Preparation progress", "तैयारी की स्थिति")}</p><div className="mt-2 h-2 rounded-full bg-stone-200 dark:bg-stone-700"><div className="h-2 rounded-full bg-maroon-700" style={{ width: `${Math.round(visit.tasks.filter((task) => task.completed).length / visit.tasks.length * 100)}%` }} /></div><p className="mt-1 text-xs text-[var(--muted)]">{visit.tasks.filter((task) => task.completed).length}/{visit.tasks.length} {T("steps complete", "चरण पूरे")}</p></div> : null}
        {visit.preferences ? <p className="mt-3 text-sm text-[var(--muted)]">{visit.preferences}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3 print:hidden"><button onClick={() => window.print()} className="btn-secondary !min-h-9 !px-3">{T("Print proforma", "प्रपत्र प्रिंट करें")}</button>{canChange ? <><div className="flex flex-wrap gap-2"><input aria-label={T("New date", "नई तारीख")} type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-nrf !w-auto !py-1.5" /><select aria-label={T("New time", "नया समय")} value={time} onChange={(event) => setTime(event.target.value)} className="input-nrf !w-auto !py-1.5"><option value="">{T("Choose time", "समय चुनें")}</option>{slots.map((slot) => <option value={slot.time} key={slot.time}>{slot.time}</option>)}</select><button disabled={!date || !time} className="btn-secondary !min-h-9 !px-3" onClick={() => void change(visit.id, "reschedule")}>{T("Request a new time", "नए समय का अनुरोध")}</button></div><button className="text-sm text-red-700" onClick={() => void change(visit.id, "cancel")}>{T("Cancel request", "अनुरोध रद्द करें")}</button></> : null}</div>
      </article>;
    })}
  </div>;
}
