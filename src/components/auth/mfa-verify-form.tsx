"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/account";
}

export function MfaVerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const response = await fetch("/api/auth/mfa/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? "Verification failed."); return; }
    router.replace(safeNext(searchParams.get("next")));
  }
  return <form onSubmit={submit} className="card-nrf mt-6 grid max-w-md gap-4 p-5">
    <label className="text-sm">Authenticator or one-time recovery code<input className="input-nrf mt-1" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus required /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="btn-primary">{busy ? "Checking…" : "Verify and continue"}</button>
  </form>;
}
