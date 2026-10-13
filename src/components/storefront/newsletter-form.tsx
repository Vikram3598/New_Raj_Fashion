"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, consent: true }),
        });
        setMsg(res.ok ? "Subscription saved." : "Could not subscribe. Please try again.");
      }}
    >
      <label className="sr-only" htmlFor="newsletter-email">
        Email
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input-nrf text-stone-900"
        placeholder="Email address"
      />
      <button className="btn-primary bg-gold-500 text-maroon-900" type="submit">
        Subscribe
      </button>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </form>
  );
}
