"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SupportInboxRow = { id: string; name: string; emailNorm: string | null; phoneNorm: string | null; subject: string; message: string; status: string; staffNote: string | null; createdAt: string };

export function SupportInbox({ requests }: { requests: SupportInboxRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function save(form: FormData, id: string) {
    setBusy(id); setError("");
    try {
      const response = await fetch(`/api/shopkeeper/support/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: form.get("status"), staffNote: form.get("staffNote") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Enquiry could not be updated.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Enquiry could not be updated."); }
    finally { setBusy(""); }
  }
  return <div className="mt-6 grid gap-4">{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{requests.map((request) => <form key={request.id} action={(form) => save(form, request.id)} className="card-nrf grid gap-3 p-5">
    <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-medium">{request.subject}</h2><p className="mt-1 text-xs text-[var(--muted)]">{request.name} · {new Date(request.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p><p className="text-xs text-[var(--muted)]">{[request.emailNorm, request.phoneNorm].filter(Boolean).join(" · ")}</p></div><span className="rounded-full bg-cream-100 px-3 py-1 text-xs dark:bg-stone-800">{request.status.replaceAll("_", " ")}</span></div>
    <p className="whitespace-pre-line text-sm">{request.message}</p>
    <label className="grid gap-1 text-xs">Internal note<textarea name="staffNote" defaultValue={request.staffNote ?? ""} maxLength={2000} className="input-nrf min-h-20"/></label>
    <div className="flex flex-wrap items-center gap-2"><label className="grid gap-1 text-xs">Status<select name="status" defaultValue={request.status} className="input-nrf"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label><button className="btn-secondary" disabled={busy === request.id}>{busy === request.id ? "Saving…" : "Save update"}</button></div>
  </form>)}{!requests.length && <p className="card-nrf p-6 text-sm text-[var(--muted)]">No customer enquiries.</p>}</div>;
}
