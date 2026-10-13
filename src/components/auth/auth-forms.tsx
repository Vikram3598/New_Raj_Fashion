"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function AuthForms({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/account";
  const [tab, setTab] = useState<"password" | "otp">("password");
  const [channel, setChannel] = useState<"EMAIL" | "PHONE">("PHONE");
  const [destination, setDestination] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [accountHint, setAccountHint] = useState("");
  const [needsHint, setNeedsHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function requestOtp() {
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, channel, purpose: mode === "signup" ? "SIGNUP" : "LOGIN" }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setChallengeId(data.challengeId);
      setInfo("If this destination can receive messages, a verification code has been sent.");
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "login") {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      router.push(data.mfaRequired ? "/auth/mfa/verify" : next);
      return;
    }
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, fullName, password, channel, destination, challengeId, code }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push(next);
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/login/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, destination, challengeId, code, accountHint }),
    });
    const data = await res.json();
    if (data.needsAccountHint) {
      setNeedsHint(true);
      setInfo(data.message);
      return;
    }
    if (!res.ok) return setError(data.error);
    router.push(data.mfaRequired ? "/auth/mfa/verify" : next);
  }

  return (
    <div className="mt-8">
      <div className="flex gap-2">
        <button type="button" className={tab === "password" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("password")}>
          Password
        </button>
        <button type="button" className={tab === "otp" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("otp")}>
          Phone or email OTP
        </button>
      </div>

      {tab === "password" ? (
        <form className="mt-6 grid gap-3" onSubmit={submitPassword}>
          {mode === "signup" ? (
            <label className="text-sm">
              Full name
              <input className="input-nrf mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
          ) : null}
          <label className="text-sm">
            Username
            <input className="input-nrf mt-1" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="text-sm">
            Password
            <input type="password" className="input-nrf mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {mode === "signup" ? (
            <>
              <label className="text-sm">
                Verify with
                <select className="input-nrf mt-1" value={channel} onChange={(e) => setChannel(e.target.value as "EMAIL" | "PHONE")}>
                  <option value="PHONE">Phone OTP</option>
                  <option value="EMAIL">Email OTP</option>
                </select>
              </label>
              <label className="text-sm">
                {channel === "EMAIL" ? "Email" : "Phone"}
                <input className="input-nrf mt-1" value={destination} onChange={(e) => setDestination(e.target.value)} required />
              </label>
              <button type="button" className="btn-secondary" onClick={requestOtp}>
                Send OTP
              </button>
              <label className="text-sm">
                OTP
                <input className="input-nrf mt-1" value={code} onChange={(e) => setCode(e.target.value)} required />
              </label>
            </>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {info ? <p className="text-sm">{info}</p> : null}
          <button className="btn-primary" type="submit">
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      ) : (
        <form className="mt-6 grid gap-3" onSubmit={submitOtp}>
          <label className="text-sm">
            Channel
            <select className="input-nrf mt-1" value={channel} onChange={(e) => setChannel(e.target.value as "EMAIL" | "PHONE")}>
              <option value="PHONE">Phone OTP</option>
              <option value="EMAIL">Email OTP</option>
            </select>
          </label>
          <label className="text-sm">
            {channel === "EMAIL" ? "Email" : "Phone"}
            <input className="input-nrf mt-1" value={destination} onChange={(e) => setDestination(e.target.value)} required />
          </label>
          <button type="button" className="btn-secondary" onClick={requestOtp}>
            Send OTP
          </button>
          <label className="text-sm">
            OTP
            <input className="input-nrf mt-1" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          {needsHint ? (
            <label className="text-sm">
              Username or customer ID
              <input className="input-nrf mt-1" value={accountHint} onChange={(e) => setAccountHint(e.target.value)} required />
            </label>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {info ? <p className="text-sm">{info}</p> : null}
          <button className="btn-primary" type="submit">
            Continue
          </button>
        </form>
      )}

      <div className="mt-6 grid gap-2 text-sm">
        {mode === "login" ? (
          <>
            <Link href="/auth/signup">Create an account</Link>
            <Link href="/auth/forgot-password">Forgot password</Link>
            <a href="/api/auth/oauth/google">Continue with Google (if configured)</a>
          </>
        ) : (
          <Link href="/auth/login">Already have an account? Login</Link>
        )}
      </div>
    </div>
  );
}
