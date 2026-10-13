import { Suspense } from "react";
import { AuthForms } from "@/components/auth/auth-forms";
export const metadata = { title: "Login" };
export default function LoginPage() {
  return <div className="container-nrf max-w-lg py-12"><h1 className="font-serif text-4xl">Login</h1><p className="mt-2 text-sm text-[var(--muted)]">Sign in with username and password, phone OTP, or email OTP. Google sign-in is available when configured. Authenticator-app MFA is a second step after you already have an account with TOTP enrolled — it is not a standalone login method.</p><Suspense fallback={<div className="skeleton mt-8 h-48"/>}><AuthForms mode="login"/></Suspense></div>;
}