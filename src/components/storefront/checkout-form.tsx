"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Address = {
  id: string;
  label: string;
  recipient: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
};

export function CheckoutForm({ addresses, codEnabled }: { addresses: Address[]; codEnabled: boolean }) {
  const router = useRouter();
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [method, setMethod] = useState<"RAZORPAY" | "COD">("RAZORPAY");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addressId, method }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Checkout failed");
      return;
    }
    if (data.razorpay?.providerOrderId && data.razorpay.keyId) {
      router.push(`/order-confirmation/${data.orderId}?pay=razorpay`);
      return;
    }
    router.push(`/order-confirmation/${data.orderId}`);
  }

  if (addresses.length === 0) {
    return (
      <p className="mt-6">
        Add a delivery address in your account before checking out.
      </p>
    );
  }

  return (
    <form className="mt-6 grid gap-4" onSubmit={submit}>
      <fieldset>
        <legend className="font-medium">Delivery address</legend>
        {addresses.map((a) => (
          <label key={a.id} className="mt-2 flex gap-2 text-sm">
            <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
            <span>
              {a.label}: {a.recipient}, {a.line1}, {a.city}, {a.state} {a.postalCode}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend className="font-medium">Payment method</legend>
        <label className="mt-2 flex gap-2 text-sm">
          <input type="radio" checked={method === "RAZORPAY"} onChange={() => setMethod("RAZORPAY")} />
          UPI / Cards / Netbanking / Wallets (Razorpay)
        </label>
        {codEnabled ? (
          <label className="mt-2 flex gap-2 text-sm">
            <input type="radio" checked={method === "COD"} onChange={() => setMethod("COD")} />
            Cash on Delivery
          </label>
        ) : null}
      </fieldset>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button className="btn-primary" disabled={busy} type="submit">
        {busy ? "Placing order..." : "Place order"}
      </button>
    </form>
  );
}
