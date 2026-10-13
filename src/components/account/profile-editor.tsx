"use client";

import { FormEvent, useState } from "react";

export function ProfileEditor({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save profile.");
      setName(data.profile.fullName); setMessage("Profile saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save profile."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={save} className="mt-5 grid max-w-xl gap-4">
    <label className="grid gap-1.5 text-sm font-medium">Full name<input className="input-nrf" autoComplete="name" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} /></label>
    <button className="btn-primary w-fit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    {message ? <p role="status" className="text-sm text-[var(--muted)]">{message}</p> : null}
  </form>;
}
