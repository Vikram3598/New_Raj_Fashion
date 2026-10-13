import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffInviteAccept } from "@/components/shopkeeper/staff-invite-accept";

export const metadata = { title: "Staff invitation" };

export default async function StaffInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) notFound();
  const invitePath = `/shopkeeper/invite?token=${token}`;
  return <main className="container-nrf max-w-xl py-14"><p className="text-xs uppercase tracking-[.2em] text-maroon-700">Staff invitation</p><h1 className="mt-2 font-serif text-4xl">Join the store team</h1><p className="mt-3 text-sm text-[var(--muted)]">This one-time link expires after seven days. Sign in with the invited verified contact before accepting.</p><StaffInviteAccept token={token}/><div className="mt-4 flex flex-wrap gap-4 text-sm"><Link className="text-maroon-700" href={`/auth/login?next=${encodeURIComponent(invitePath)}`}>Sign in to the invited account</Link><Link className="text-maroon-700" href={`/auth/signup?next=${encodeURIComponent(invitePath)}`}>Create an account with the invited contact</Link></div></main>;
}
