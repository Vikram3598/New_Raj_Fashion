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

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string; amount: number; currency: "INR"; name: string; description: string; order_id: string;
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
};
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => { open: () => void } } }

let razorpayScript: Promise<boolean> | null = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  if (!razorpayScript) razorpayScript = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return razorpayScript;
}

type CheckoutResult = { orderId: string; razorpay: null | { providerOrderId: string; amountPaise: number; keyId: string } };

export function CheckoutForm({ addresses, codEnabled, razorpayEnabled }: { addresses: Address[]; codEnabled: boolean; razorpayEnabled: boolean }) {
  const router = useRouter();
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [method, setMethod] = useState<"RAZORPAY" | "COD">(razorpayEnabled ? "RAZORPAY" : "COD");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (method === "RAZORPAY" && !(await loadRazorpay())) throw new Error("The secure payment window could not load. Please try again.");
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId, method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (method === "COD") {
        router.push(`/order-confirmation/${data.orderId}`);
        return;
      }
      const checkout = data as CheckoutResult;
      if (!checkout.razorpay || !window.Razorpay) throw new Error("The payment session could not be started. Contact the store before placing another order.");
      const gateway = new window.Razorpay({
        key: checkout.razorpay.keyId,
        amount: checkout.razorpay.amountPaise,
        currency: "INR",
        name: "New Raj Fashion & Raj Saree Showroom",
        description: "Order payment",
        order_id: checkout.razorpay.providerOrderId,
        handler: async (response) => {
          try {
            const verified = await fetch("/api/payments/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) });
            const result = await verified.json();
            if (!verified.ok) throw new Error(result.error ?? "Payment verification is pending.");
            router.replace(`/order-confirmation/${checkout.orderId}?payment=verified`);
            router.refresh();
          } catch (error) {
            setError(error instanceof Error ? `${error.message} You can check the latest order status in your account.` : "Payment verification is pending. Check your order status in your account.");
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      gateway.open();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Checkout failed. Please try again.");
      setBusy(false);
    }
  }

  if (addresses.length === 0) {
    return (
      <p className="mt-6">
        <a className="text-maroon-700" href="/account/addresses">Add a delivery address</a> before checking out.
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
        {razorpayEnabled ? <label className="mt-2 flex gap-2 text-sm">
          <input type="radio" checked={method === "RAZORPAY"} onChange={() => setMethod("RAZORPAY")} />
          UPI / Cards / Netbanking / Wallets (Razorpay)
        </label> : <p className="mt-2 text-sm text-[var(--muted)]">Online payment is not configured yet.</p>}
        {codEnabled ? (
          <label className="mt-2 flex gap-2 text-sm">
            <input type="radio" checked={method === "COD"} onChange={() => setMethod("COD")} />
            Cash on Delivery
          </label>
        ) : null}
      </fieldset>
      {!codEnabled && !razorpayEnabled ? <p className="text-sm text-[var(--muted)]">No payment method is currently enabled. Please contact the store.</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button className="btn-primary" disabled={busy || (!codEnabled && !razorpayEnabled)} type="submit">
        {busy ? "Placing order..." : "Place order"}
      </button>
    </form>
  );
}
