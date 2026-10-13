"use client";

import { FormEvent, useState } from "react";

export type AddressRecord = {
  id: string; label: string; recipient: string; line1: string; line2: string | null;
  city: string; state: string; postalCode: string; phone: string | null; isDefault: boolean;
};

const emptyAddress = { label: "Home", recipient: "", line1: "", line2: "", city: "", state: "", postalCode: "", phone: "", isDefault: false };

export function AddressManager({ initialAddresses }: { initialAddresses: AddressRecord[] }) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [form, setForm] = useState<typeof emptyAddress>(emptyAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function startNew() { setForm({ ...emptyAddress, isDefault: addresses.length === 0 }); setEditingId(null); setShowForm(true); setMessage(""); }
  function startEdit(address: AddressRecord) {
    setForm({ label: address.label, recipient: address.recipient, line1: address.line1, line2: address.line2 ?? "", city: address.city, state: address.state, postalCode: address.postalCode, phone: address.phone ?? "", isDefault: address.isDefault });
    setEditingId(address.id); setShowForm(true); setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(editingId ? `/api/account/addresses/${editingId}` : "/api/account/addresses", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save address.");
      const address = data.address as AddressRecord;
      setAddresses((current) => {
        const updated = current.map((item) => form.isDefault ? { ...item, isDefault: false } : item);
        return editingId ? updated.map((item) => item.id === address.id ? address : item) : [...updated, address];
      });
      setShowForm(false); setEditingId(null); setMessage("Address saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save address."); }
    finally { setBusy(false); }
  }

  async function remove(address: AddressRecord) {
    if (!window.confirm(`Delete the ${address.label.toLowerCase()} address?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/account/addresses/${address.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to delete address.");
      const next = addresses.filter((item) => item.id !== address.id);
      if (address.isDefault && next.length) next[0] = { ...next[0], isDefault: true };
      setAddresses(next); setMessage("Address deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to delete address."); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--muted)]">Your addresses are private to your account. Addresses already used by an order are retained with that order.</p>
      {!showForm ? <button type="button" className="btn-primary" onClick={startNew}>Add address</button> : null}
    </div>
    {message ? <p role="status" className="text-sm text-[var(--muted)]">{message}</p> : null}
    {addresses.length ? <div className="grid gap-3 sm:grid-cols-2">{addresses.map((address) => <article key={address.id} className="rounded-xl border border-stone-200 p-4 dark:border-stone-700">
      <div className="flex items-center justify-between gap-2"><p className="font-medium">{address.label}</p>{address.isDefault ? <span className="rounded-full bg-cream-100 px-2.5 py-1 text-xs dark:bg-stone-800">Default</span> : null}</div>
      <p className="mt-3 text-sm leading-6">{address.recipient}<br />{address.line1}{address.line2 ? <><br />{address.line2}</> : null}<br />{address.city}, {address.state} {address.postalCode}{address.phone ? <><br />{address.phone}</> : null}</p>
      <div className="mt-4 flex gap-4 text-sm"><button type="button" disabled={busy} className="font-medium text-maroon-700" onClick={() => startEdit(address)}>Edit</button><button type="button" disabled={busy} className="text-red-700" onClick={() => void remove(address)}>Delete</button></div>
    </article>)}</div> : <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-[var(--muted)] dark:border-stone-700">No saved addresses yet.</div>}
    {showForm ? <form onSubmit={save} className="rounded-xl border border-stone-200 p-4 dark:border-stone-700 sm:p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-medium">{editingId ? "Edit address" : "New address"}</h3><button type="button" className="text-sm text-[var(--muted)]" onClick={() => setShowForm(false)}>Close</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Label<input className="input-nrf" maxLength={40} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Home, Work" /></label>
        <label className="grid gap-1 text-sm">Recipient name<input className="input-nrf" autoComplete="name" maxLength={120} required value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Address line 1<input className="input-nrf" autoComplete="address-line1" maxLength={180} required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Address line 2 <span className="font-normal text-[var(--muted)]">(optional)</span><input className="input-nrf" autoComplete="address-line2" maxLength={180} value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">City<input className="input-nrf" autoComplete="address-level2" maxLength={80} required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">State<input className="input-nrf" autoComplete="address-level1" maxLength={80} required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">PIN code<input className="input-nrf" autoComplete="postal-code" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} required value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Delivery phone <span className="font-normal text-[var(--muted)]">(optional)</span><input className="input-nrf" autoComplete="tel" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
      </div>
      <label className="mt-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Set as default address</label>
      <div className="mt-4"><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save address"}</button></div>
    </form> : null}
  </div>;
}
