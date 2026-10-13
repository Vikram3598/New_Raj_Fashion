import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { MfaVerifyForm } from "@/components/auth/mfa-verify-form";

export const metadata = { title: "Authenticator verification" };

export default async function MfaVerifyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login");
  if (!user.mfaEnabled || user.mfaSatisfied) redirect("/account");
  return <main className="container-nrf py-12"><p className="text-xs uppercase tracking-[.18em] text-maroon-700">Account security</p><h1 className="mt-2 font-serif text-4xl">Verify it’s you</h1><p className="mt-3 max-w-xl text-sm text-[var(--muted)]">Enter a code from your authenticator app or one of your unused recovery codes to finish signing in.</p><Suspense fallback={<div className="skeleton mt-6 h-44 max-w-md" />}><MfaVerifyForm /></Suspense></main>;
}
