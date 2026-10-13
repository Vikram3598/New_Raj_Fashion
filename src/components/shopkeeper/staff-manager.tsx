"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const choices = [
  { key: "product.read", label: "View catalogue" },
  { key: "inventory.read", label: "View inventory" },
  { key: "inventory.adjust", label: "Record stock counts" },
  { key: "order.read", label: "View orders" },
  { key: "order.fulfil", label: "Update fulfilment" },
  { key: "customer.read", label: "Customer enquiries and limited lookup" },
];

type StaffRow = { id: string; username: string; customerCode: string; status: string; permissions: string[] };
type InvitationRow = { id: string; emailNorm: string | null; phoneNorm: string | null; expiresAt: string };

export function StaffManager({ staff, invitations }: { staff: StaffRow[]; invitations: InvitationRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(form: FormData) {
    setBusy(true); setMessage("");
    const permissions = choices.map((choice) => choice.key).filter((key) => form.get(key) === "on");
    try {
      const response = await fetch("/api/owner/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: String(form.get("username") ?? ""), permissions }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save staff account.");
      setMessage("Staff access saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save staff account."); }
    finally { setBusy(false); }
  }

  async function invite(form: FormData) {
    setBusy(true); setMessage(""); setInviteUrl("");
    try {
      const response = await fetch("/api/owner/staff/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: String(form.get("email") ?? ""), phone: String(form.get("phone") ?? "") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Invitation could not be created.");
      setInviteUrl(data.inviteUrl); setMessage(data.emailQueued || data.smsQueued ? "Invitation created and sent. You can also copy the one-time link." : "Invitation created. Copy the one-time link and share it with the invitee."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be created."); }
    finally { setBusy(false); }
  }

  async function setStatus(id: string, status: string) {
    setMessage("");
    const response = await fetch(`/api/owner/staff/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "Could not update staff."); return; }
    router.refresh();
  }

  async function revokeInvitation(id: string) {
    const response = await fetch(`/api/owner/staff/invitations/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "Invitation could not be revoked."); return; }
    router.refresh();
  }

  return <>
    <form action={invite} className="card-nrf mt-6 grid gap-4 p-5">
      <h2 className="font-serif text-2xl">Invite staff</h2>
      <p className="text-sm text-[var(--muted)]">Send an expiring invitation to a verified email or phone. A one-time link is shown once so you can share it if delivery is not configured.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Email<input name="email" type="email" className="input-nrf"/></label><label className="grid gap-1 text-sm">Phone<input name="phone" type="tel" className="input-nrf"/></label></div>
      <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button>{message && <span aria-live="polite" className="text-sm">{message}</span>}</div>
      {inviteUrl && <div className="grid gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700"><label className="text-xs font-medium" htmlFor="staff-invite-link">One-time invitation link</label><input id="staff-invite-link" readOnly value={inviteUrl} className="input-nrf font-mono text-xs"/><button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => setMessage("Invitation link copied."))} className="btn-secondary w-fit">Copy link</button></div>}
    </form>
    <section className="mt-8"><h2 className="font-serif text-2xl">Pending invitations</h2><div className="mt-4 grid gap-3">{invitations.map((invitation) => <article key={invitation.id} className="card-nrf flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{invitation.emailNorm ?? invitation.phoneNorm}</strong><p className="text-xs text-[var(--muted)]">Expires {new Date(invitation.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p></div><button className="btn-secondary" onClick={() => revokeInvitation(invitation.id)}>Revoke invitation</button></article>)}{!invitations.length && <p className="card-nrf p-5 text-sm text-[var(--muted)]">No pending invitations.</p>}</div></section>
      <form action={add} className="card-nrf mt-8 grid gap-4 p-5"><h2 className="font-serif text-2xl">Grant access to an existing account</h2><p className="text-sm text-[var(--muted)]">This immediate option is for a person who already has an active customer account.</p><label className="grid gap-1 text-sm">Account username<input name="username" required minLength={3} className="input-nrf"/></label><fieldset><legend className="text-sm font-medium">Allowed actions</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <label key={choice.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={choice.key} defaultChecked={!(["inventory.read", "inventory.adjust", "customer.read"] as string[]).includes(choice.key)}/>{choice.label}</label>)}</div></fieldset><div className="flex items-center gap-3"><button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save staff access"}</button>{message && <span aria-live="polite" className="text-sm">{message}</span>}</div></form>
    <section className="mt-8"><h2 className="font-serif text-2xl">Staff accounts</h2><div className="mt-4 grid gap-3">{staff.map((person) => <article key={person.id} className="card-nrf flex flex-wrap items-center justify-between gap-4 p-4"><div><strong>{person.username}</strong><p className="text-xs text-[var(--muted)]">{person.customerCode} · {person.status} · {person.permissions.join(", ") || "No assigned permissions"}</p></div>{person.status === "ACTIVE" ? <button className="btn-secondary" onClick={() => setStatus(person.id, "SUSPENDED")}>Suspend access</button> : <button className="btn-primary" onClick={() => setStatus(person.id, "ACTIVE")}>Reactivate</button>}</article>)}{!staff.length && <p className="card-nrf p-6 text-sm text-[var(--muted)]">No staff accounts assigned.</p>}</div></section>
  </>;
}
