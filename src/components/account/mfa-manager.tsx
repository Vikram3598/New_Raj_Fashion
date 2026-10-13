"use client";

import { useState } from "react";
import Image from "next/image";

type Setup = { secret: string; qrCodeDataUrl: string };

export function MfaManager({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true); setError(null); setMessage(null);
    const response = await fetch("/api/auth/mfa/setup", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not start authenticator setup.");
    setSetup(data as Setup);
  }
  async function verify() {
    setBusy(true); setError(null);
    const response = await fetch("/api/auth/mfa/setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not enable MFA.");
    setRecoveryCodes(data.recoveryCodes ?? []);
    setSetup(null);
    setMessage("Authenticator verification is enabled. Save these recovery codes somewhere private; they are shown only once.");
  }
  async function disable() {
    setBusy(true); setError(null); setMessage(null);
    const response = await fetch("/api/auth/mfa/setup", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not disable MFA.");
    window.location.reload();
  }

  return <section className="card-nrf mt-5 max-w-2xl p-5">
    <h2 className="font-serif text-2xl">Authenticator app</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Use an authenticator app for a time-based verification code when you sign in. Recovery codes can each be used once.</p>
    {enabled ? <>
      <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">Two-step verification is enabled.</p>
      <label className="mt-4 block text-sm">Current six-digit authenticator code<input className="input-nrf mt-1" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
      <button type="button" disabled={busy || code.length !== 6} onClick={disable} className="btn-secondary mt-3">{busy ? "Updating…" : "Disable two-step verification"}</button>
    </> : setup ? <>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <Image src={setup.qrCodeDataUrl} alt="QR code for authenticator app enrollment" width={200} height={200} unoptimized className="rounded-lg bg-white p-2" />
        <div className="min-w-0"><p className="text-sm">Scan this code with your authenticator app, or enter the setup key manually:</p><code className="mt-2 block break-all rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-900">{setup.secret}</code></div>
      </div>
      <label className="mt-4 block text-sm">Six-digit code from the app<input className="input-nrf mt-1" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
      <button type="button" disabled={busy || code.length !== 6} onClick={verify} className="btn-primary mt-3">{busy ? "Verifying…" : "Verify and enable"}</button>
    </> : <button type="button" disabled={busy} onClick={begin} className="btn-primary mt-4">{busy ? "Preparing…" : "Set up authenticator"}</button>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {message && <p className="mt-4 text-sm">{message}</p>}
    {recoveryCodes.length > 0 && <ul className="mt-3 grid max-w-sm grid-cols-2 gap-2 font-mono text-sm">{recoveryCodes.map((item) => <li key={item} className="rounded bg-stone-100 p-2 dark:bg-stone-900">{item}</li>)}</ul>}
  </section>;
}
