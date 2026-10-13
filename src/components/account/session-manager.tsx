"use client";

import { useState } from "react";

type SessionRow = { id: string; userAgent: string | null; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean };

function format(value: string) { return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }); }

export function SessionManager({ initialSessions }: { initialSessions: SessionRow[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function revoke(sessionId?: string) {
    setBusy(true); setError(null);
    const response = await fetch("/api/account/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sessionId ? { sessionId } : {}) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not revoke sessions.");
    setSessions((rows) => sessionId ? rows.filter((row) => row.id !== sessionId) : rows.filter((row) => row.current));
  }
  const hasOthers = sessions.some((session) => !session.current);
  return <div className="mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted)]">Active browser sessions for this account.</p><button type="button" disabled={busy || !hasOthers} onClick={() => revoke()} className="btn-secondary">{busy ? "Revoking…" : "Sign out other sessions"}</button></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 grid gap-3">{sessions.map((session) => <article key={session.id} className="card-nrf flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="font-medium">{session.current ? "This device" : "Signed-in device"}</p><p className="mt-1 break-words text-xs text-[var(--muted)]">{session.userAgent || "Browser details unavailable"}</p><p className="mt-2 text-xs text-[var(--muted)]">Last active {format(session.lastSeenAt)} · Signed in {format(session.createdAt)} · Expires {format(session.expiresAt)}</p></div>{!session.current && <button type="button" disabled={busy} onClick={() => revoke(session.id)} className="btn-secondary">Revoke</button>}</article>)}
    {!sessions.length && <p className="card-nrf p-6 text-center text-sm text-[var(--muted)]">No active sessions were found.</p>}</div>
  </div>;
}
