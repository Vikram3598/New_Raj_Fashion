"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StaffInviteAccept({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/shopkeeper/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Invitation could not be accepted.");
      router.push(data.destination ?? "/shopkeeper"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be accepted."); }
    finally { setBusy(false); }
  }
  return <div className="card-nrf mt-6 grid gap-4 p-5"><p className="text-sm">Accepting this invitation gives your verified account the default Staff permissions. The Owner can adjust them later.</p><button className="btn-primary w-fit" onClick={accept} disabled={busy}>{busy ? "Accepting…" : "Accept staff invitation"}</button>{message && <p role="alert" className="text-sm text-red-700">{message}. Sign in with the invited, verified contact, then open this link again if needed.</p>}</div>;
}
