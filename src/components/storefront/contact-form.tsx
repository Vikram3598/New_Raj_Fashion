"use client";

import { useState, type FormEvent } from "react";

export function ContactForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), phone: form.get("phone"), subject: form.get("subject"), message: form.get("message") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your message could not be sent.");
      event.currentTarget.reset(); setMessage("Your enquiry has been sent to the showroom team.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your message could not be sent."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="card-nrf mt-6 grid max-w-2xl gap-4 p-5">
    <h2 className="font-serif text-2xl">Send an enquiry</h2>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Name<input name="name" required maxLength={120} className="input-nrf"/></label><label className="grid gap-1 text-sm">Email<input name="email" type="email" maxLength={254} className="input-nrf"/></label></div>
    <label className="grid gap-1 text-sm">Phone<input name="phone" type="tel" maxLength={30} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Subject<input name="subject" required minLength={3} maxLength={120} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Message<textarea name="message" required minLength={20} maxLength={4000} className="input-nrf min-h-32"/></label>
    <p className="text-xs text-[var(--muted)]">Add an email or phone number so the showroom can reply. Avoid sending payment credentials or other sensitive information.</p>
    <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send enquiry"}</button>{message && <span aria-live="polite" className="text-sm">{message}</span>}</div>
  </form>;
}
