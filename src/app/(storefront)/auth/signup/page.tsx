import { AuthForms } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <div className="container-nrf max-w-lg py-12">
      <h1 className="font-serif text-4xl">Create account</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Choose a unique username. A phone number or email may be used on more than one account. After OTP verification you will receive a customer ID.
      </p>
      <AuthForms mode="signup" />
    </div>
  );
}
