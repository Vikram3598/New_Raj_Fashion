import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { MfaManager } from "@/components/account/mfa-manager";

export const metadata = { title: "Set up authenticator" };

export default async function MfaSetupPage() {
  let user;
  try { user = await requireUser(); } catch { redirect("/auth/login?next=%2Fauth%2Fmfa%2Fsetup"); }
  if (user.mfaEnabled) redirect("/account/security");
  return <main className="container-nrf py-12"><h1 className="font-serif text-4xl">Set up authenticator</h1><p className="mt-3 text-sm text-[var(--muted)]">Enroll a compatible authenticator app to add a second step to sign-in.</p><MfaManager enabled={false} /></main>;
}
