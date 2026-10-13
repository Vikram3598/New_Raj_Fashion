import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { ProfileEditor } from "@/components/account/profile-editor";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return null;
  const [profile, identities] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id }, select: { fullName: true } }),
    prisma.userIdentity.findMany({ where: { userId: user.id, verifiedAt: { not: null } }, select: { type: true, valueNormalized: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }),
  ]);
  return <div className="card-nrf p-5 sm:p-6">
    <h2 className="font-serif text-3xl">Profile</h2>
    <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Keep your name current. Phone numbers and email addresses are managed as verified sign-in identities and are read-only here.</p>
    <ProfileEditor initialName={profile?.fullName ?? ""} />
    <div className="mt-8 border-t border-stone-200 pt-5 dark:border-stone-800">
      <h3 className="font-medium">Verified sign-in methods</h3>
      {identities.length ? <ul className="mt-3 grid gap-2 text-sm">{identities.map((identity) => <li key={`${identity.type}-${identity.valueNormalized}`} className="flex flex-wrap gap-x-2"><span>{identity.type === "PHONE" ? "Phone" : "Email"}:</span><span>{identity.valueNormalized}</span>{identity.isPrimary ? <span className="text-[var(--muted)]">· Primary</span> : null}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">No verified phone or email is linked to this account.</p>}
    </div>
    <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800"><p className="text-sm text-[var(--muted)]">Account username</p><p className="mt-1 font-medium">{user.username}</p><p className="mt-3 text-sm text-[var(--muted)]">Customer ID</p><p className="mt-1 font-mono text-sm">{user.customerCode}</p></div>
  </div>;
}
