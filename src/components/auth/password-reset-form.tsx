"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PasswordResetForm() {
  const router = useRouter();
  const [channel, setChannel] = useState<"PHONE" | "EMAIL">("PHONE");
  const [destination, setDestination] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setError(null); setMessage(null); setBusy(true);
    const response = await fetch("/api/auth/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, destination, purpose: "RESET_PASSWORD" }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Unable to request a code.");
    setChallengeId(data.challengeId);
    setMessage(data.devCode ? `Development test code: ${data.devCode}` : "If this destination is reachable, a verification code has been sent.");
  }

  async function reset(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    const response = await fetch("/api/auth/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, destination, challengeId, code, username, password }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Unable to reset password.");
    router.replace("/auth/login?reset=success");
  }

  return <form onSubmit={reset} className="card-nrf mt-6 grid max-w-lg gap-4 p-5">
    <label className="text-sm">Verified contact type<select className="input-nrf mt-1" value={channel} onChange={(event) => setChannel(event.target.value as "PHONE" | "EMAIL")}><option value="PHONE">Phone</option><option value="EMAIL">Email</option></select></label>
    <label className="text-sm">{channel === "PHONE" ? "Phone number" : "Email address"}<input className="input-nrf mt-1" value={destination} onChange={(event) => setDestination(event.target.value)} autoComplete={channel === "PHONE" ? "tel" : "email"} required /></label>
    <button type="button" className="btn-secondary" disabled={busy || !destination} onClick={requestCode}>{busy ? "Sending…" : "Send verification code"}</button>
    {challengeId && <>
      <label className="text-sm">Username or customer ID<input className="input-nrf mt-1" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
      <label className="text-sm">Verification code<input className="input-nrf mt-1" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></label>
      <label className="text-sm">New password<input type="password" className="input-nrf mt-1" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} autoComplete="new-password" required /><span className="mt-1 block text-xs text-[var(--muted)]">Use at least 10 characters.</span></label>
      <button className="btn-primary" disabled={busy}>{busy ? "Updating…" : "Reset password"}</button>
    </>}
    {message && <p className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
