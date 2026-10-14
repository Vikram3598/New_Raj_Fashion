"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/locale-provider";

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

export function CheckoutForm({ addresses, codEnabled, cashOnPickupEnabled, razorpayEnabled, store }: { addresses: Address[]; codEnabled: boolean; cashOnPickupEnabled: boolean; razorpayEnabled: boolean; store: { name: string; address: string; openMinute: number; closeMinute: number } }) {
  const router = useRouter();
  const { locale } = useLocale();
  const T = (english: string, hindi: string) => locale === "hi" ? hindi : english;
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [fulfilmentType, setFulfilmentType] = useState<"DELIVERY" | "STORE_PICKUP">("DELIVERY");
  const [method, setMethod] = useState<"RAZORPAY" | "COD" | "CASH_ON_PICKUP">(razorpayEnabled ? "RAZORPAY" : "COD");
  const [pickupDate, setPickupDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [pickupTime, setPickupTime] = useState("");
  const [pickupSlots, setPickupSlots] = useState<{ time: string; available: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (fulfilmentType !== "STORE_PICKUP" || !pickupDate) return;
    fetch(`/api/store-visits/availability?date=${encodeURIComponent(pickupDate)}&kind=PICKUP`).then((response) => response.json()).then((data) => setPickupSlots((data.slots ?? []).filter((slot: { available: number; closed: boolean }) => slot.available > 0 && !slot.closed))).catch(() => setPickupSlots([]));
  }, [fulfilmentType, pickupDate]);
  useEffect(() => {
    if (fulfilmentType === "STORE_PICKUP") {
      if (method === "COD" || (!razorpayEnabled && cashOnPickupEnabled)) setMethod(razorpayEnabled ? "RAZORPAY" : "CASH_ON_PICKUP");
    } else if (method === "CASH_ON_PICKUP") setMethod(razorpayEnabled ? "RAZORPAY" : "COD");
  }, [fulfilmentType, method, cashOnPickupEnabled, razorpayEnabled]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (method === "RAZORPAY" && !(await loadRazorpay())) throw new Error("The secure payment window could not load. Please try again.");
      const pickupAt = fulfilmentType === "STORE_PICKUP" && pickupTime ? new Date(`${pickupDate}T${pickupTime}:00+05:30`).toISOString() : undefined;
      if (fulfilmentType === "STORE_PICKUP" && !pickupAt) throw new Error("Choose an available pickup date and time.");
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: fulfilmentType === "DELIVERY" ? addressId : undefined, method, fulfilmentType, pickupAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (method !== "RAZORPAY") {
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

  return (
    <form className="mt-6 grid gap-4" onSubmit={submit}>
      <fieldset>
        <legend className="font-medium">{T("Fulfilment", "ऑर्डर प्राप्त करने का तरीका")}</legend>
        <label className="mt-2 flex gap-2 text-sm"><input type="radio" name="fulfilment" checked={fulfilmentType === "DELIVERY"} onChange={() => setFulfilmentType("DELIVERY")} />{T("Home Delivery", "घर पर डिलीवरी")}</label>
        <label className="mt-2 flex gap-2 text-sm"><input type="radio" name="fulfilment" checked={fulfilmentType === "STORE_PICKUP"} onChange={() => setFulfilmentType("STORE_PICKUP")} />{T("Store Pickup", "दुकान से प्राप्त करें")}</label>
      </fieldset>
      {fulfilmentType === "DELIVERY" ? <fieldset>
        <legend className="font-medium">{T("Delivery address", "डिलीवरी का पता")}</legend>
        {addresses.length === 0 ? <p className="mt-2 text-sm">{T("No saved addresses.", "कोई सहेजा हुआ पता नहीं है।")} <a className="text-maroon-700 underline" href="/account/addresses">{T("Add a delivery address", "डिलीवरी का पता जोड़ें")}</a>.</p> : null}
        {addresses.map((a) => (
          <label key={a.id} className="mt-2 flex gap-2 text-sm">
            <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
            <span>
              {a.label}: {a.recipient}, {a.line1}, {a.city}, {a.state} {a.postalCode}
            </span>
          </label>
        ))}
      </fieldset> : <section className="card-nrf grid gap-3 p-4"><div><p className="font-medium">{store.name}</p><p className="text-sm text-[var(--muted)]">{store.address}</p><p className="mt-1 text-xs text-[var(--muted)]">{String(Math.floor(store.openMinute / 60)).padStart(2,"0")}:00–{String(Math.floor(store.closeMinute / 60)).padStart(2,"0")}:00 · no delivery charge</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Pickup date<input type="date" value={pickupDate} onChange={(event) => { setPickupDate(event.target.value); setPickupTime(""); }} min={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())} required className="input-nrf" /></label><label className="grid gap-1 text-sm">Available pickup time<select value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} required className="input-nrf"><option value="">Choose a pickup time</option>{pickupSlots.map((slot) => <option value={slot.time} key={slot.time}>{slot.time} ({slot.available} available)</option>)}</select></label></div><p className="text-xs text-[var(--muted)]">We will send a pickup-ready update. Bring your order reference and one-time pickup code when collecting.</p></section>}
      <fieldset>
        <legend className="font-medium">{T("Payment method", "भुगतान का तरीका")}</legend>
        {razorpayEnabled ? <label className="mt-2 flex gap-2 text-sm">
          <input type="radio" checked={method === "RAZORPAY"} onChange={() => setMethod("RAZORPAY")} />
          UPI / Cards / Netbanking / Wallets (Razorpay)
        </label> : <p className="mt-2 text-sm text-[var(--muted)]">{T("Online payment is not configured yet.", "ऑनलाइन भुगतान अभी सेट नहीं है।")}</p>}
        {codEnabled && fulfilmentType === "DELIVERY" ? (
          <label className="mt-2 flex gap-2 text-sm">
            <input type="radio" checked={method === "COD"} onChange={() => setMethod("COD")} />
            {T("Cash on Delivery", "डिलीवरी पर नकद भुगतान")}
          </label>
        ) : null}
        {cashOnPickupEnabled && fulfilmentType === "STORE_PICKUP" ? <label className="mt-2 flex gap-2 text-sm"><input type="radio" checked={method === "CASH_ON_PICKUP"} onChange={() => setMethod("CASH_ON_PICKUP")} />{T("Cash on Pickup", "पिकअप के समय नकद भुगतान")}</label> : null}
      </fieldset>
      {fulfilmentType === "DELIVERY" && addresses.length === 0 ? <p className="text-sm text-red-700">{T("Add a delivery address or select Store Pickup.", "डिलीवरी का पता जोड़ें या दुकान से पिकअप चुनें।")}</p> : null}
      {!razorpayEnabled && !(fulfilmentType === "DELIVERY" ? codEnabled : cashOnPickupEnabled) ? <p className="text-sm text-[var(--muted)]">{T("No payment method is currently enabled for this fulfilment option. Please contact the store.", "इस विकल्प के लिए भुगतान का तरीका चालू नहीं है। कृपया दुकान से संपर्क करें।")}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button className="btn-primary" disabled={busy || (fulfilmentType === "DELIVERY" ? (!codEnabled && !razorpayEnabled) || (!addressId && addresses.length > 0) : (!cashOnPickupEnabled && !razorpayEnabled) || !pickupTime)} type="submit">
        {busy ? T("Placing order...", "ऑर्डर दिया जा रहा है...") : T("Place order", "ऑर्डर करें")}
      </button>
    </form>
  );
}
