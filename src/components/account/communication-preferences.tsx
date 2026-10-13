"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Preferences = { emailOffers: boolean; smsOffers: boolean; orderUpdates: boolean };

export function CommunicationPreferences({ initial }: { initial: Preferences }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Preferences could not be saved.");
      setValue(data.preferences); setMessage("Preferences saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preferences could not be saved."); }
    finally { setBusy(false); }
  }

  return <section className="card-nrf grid gap-4 p-5">
    <div><h2 className="font-serif text-2xl">Communication preferences</h2><p className="mt-1 text-sm text-[var(--muted)]">Choose optional offers and order progress messages. Security and payment receipts remain service messages.</p></div>
    {([
      ["emailOffers", "Email offers and new collections"],
      ["smsOffers", "SMS offers and new collections"],
      ["orderUpdates", "Order and delivery updates"],
    ] as const).map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={value[key]} onChange={(event) => setValue((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1"/><span>{label}</span></label>)}
    <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button>{message && <span aria-live="polite" className="text-sm">{message}</span>}</div>
  </section>;
}
