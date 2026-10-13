import { redirect } from "next/navigation";

export default function DeprecatedOAuthCallback() {
  redirect("/auth/login?error=google");
}
