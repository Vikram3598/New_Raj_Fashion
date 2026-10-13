import { PasswordResetForm } from "@/components/auth/password-reset-form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return <main className="container-nrf max-w-2xl py-12"><p className="text-xs uppercase tracking-[.18em] text-maroon-700">Account access</p><h1 className="mt-2 font-serif text-4xl">Reset your password</h1><p className="mt-3 text-sm text-[var(--muted)]">Verify a phone number or email already linked to the account, then enter its username or customer ID to identify the right account.</p><PasswordResetForm /></main>;
}
