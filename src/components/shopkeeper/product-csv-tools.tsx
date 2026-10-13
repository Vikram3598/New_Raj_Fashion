"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ProductCsvTools() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/owner/products/import", { method: "POST", body: new FormData(event.currentTarget) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "CSV import failed.");
      setMessage(`Imported ${data.products} products and ${data.variants} variants.`); event.currentTarget.reset(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "CSV import failed."); }
    finally { setBusy(false); }
  }
  return <section className="card-nrf mt-6 grid gap-4 p-5">
    <div><h2 className="font-serif text-2xl">Product CSV</h2><p className="mt-1 text-sm text-[var(--muted)]">Import creates new products only. The export includes one row per variant and is the format accepted by import.</p></div>
    <Link className="btn-secondary w-fit" href="/api/owner/products/export" download>Export catalogue CSV</Link>
    <form onSubmit={importCsv} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-sm">CSV file<input className="input-nrf" type="file" name="file" accept=".csv,text/csv" required/></label><button className="btn-primary" disabled={busy}>{busy ? "Importing…" : "Import new products"}</button></form>
    {message && <p aria-live="polite" className="text-sm">{message}</p>}
  </section>;
}
