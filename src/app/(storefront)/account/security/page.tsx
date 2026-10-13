import { requireUser } from "@/lib/auth/session";
import { MfaManager } from "@/components/account/mfa-manager";

export const metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const user = await requireUser();
  return <div><h2 className="font-serif text-3xl">Security</h2><p className="mt-2 text-sm text-[var(--muted)]">Manage the extra verification step for this account.</p><MfaManager enabled={user.mfaEnabled} /></div>;
}
