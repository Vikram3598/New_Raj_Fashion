"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
      router.refresh();
    } finally { setBusy(false); }
  }
  return <button type="button" disabled={busy} onClick={() => void signOut()} className="whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/30">{busy ? "Signing out…" : "Sign out"}</button>;
}
