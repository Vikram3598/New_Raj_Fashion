"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  storeName: string; legalName: string | null; address: string; city: string; state: string; postalCode: string;
  phone: string | null; email: string | null; gstin: string | null; openingHours: unknown;
  policyReturns: string | null; policyShipping: string | null; policyPrivacy: string | null; policyTerms: string | null;
  paymentConfig: unknown; deliveryRules: unknown; taxConfig: unknown; invoiceConfig: unknown;
  visitCapacity: number; pickupCapacity: number; allowCashOnPickup: boolean; visitReminderMinutes: number[]; pickupReminderMinutes: number[]; appointmentOpenMinute: number; appointmentCloseMinute: number;
};
type DeliveryRules = { feePaise?: number; freeAbovePaise?: number | null; allowedPostalCodes?: string[] };
type TaxConfig = { rateBps?: number };
type InvoiceConfig = { prefix?: string; footer?: string };

export function SettingsEditor({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const hours = typeof settings.openingHours === "object" && settings.openingHours ? JSON.stringify(settings.openingHours, null, 2) : "";
  const cod = Boolean((settings.paymentConfig as { codEnabled?: boolean } | null)?.codEnabled);
  const delivery = (settings.deliveryRules as DeliveryRules | null) ?? {};
  const tax = (settings.taxConfig as TaxConfig | null) ?? {};
  const invoice = (settings.invoiceConfig as InvoiceConfig | null) ?? {};

  async function save(form: FormData) {
    setBusy(true); setMessage("");
    let openingHours: Record<string, string> | null = null;
    try {
      const value = String(form.get("openingHours") ?? "").trim();
      openingHours = value ? JSON.parse(value) as Record<string, string> : null;
      if (openingHours !== null && (typeof openingHours !== "object" || Array.isArray(openingHours) || Object.values(openingHours).some((item) => typeof item !== "string"))) throw new Error("Opening hours must be a JSON object with text values.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid opening hours."); setBusy(false); return; }
    const nullable = (name: string) => String(form.get(name) ?? "").trim() || null;
    const fee = Number(form.get("deliveryFee") ?? 0);
    const freeAboveText = String(form.get("freeDeliveryAbove") ?? "").trim();
    const taxRate = Number(form.get("taxRate") ?? 0);
    const allowedPostalCodes = String(form.get("allowedPostalCodes") ?? "").split(/[\s,;]+/).map((postal) => postal.trim()).filter(Boolean);
    const payload = {
      storeName: String(form.get("storeName") ?? ""), legalName: nullable("legalName"), address: String(form.get("address") ?? ""), city: String(form.get("city") ?? ""), state: String(form.get("state") ?? ""), postalCode: String(form.get("postalCode") ?? ""),
      phone: nullable("phone"), email: nullable("email"), gstin: nullable("gstin"), openingHours,
      policyReturns: nullable("policyReturns"), policyShipping: nullable("policyShipping"), policyPrivacy: nullable("policyPrivacy"), policyTerms: nullable("policyTerms"), codEnabled: form.get("codEnabled") === "on",
      deliveryFeeRupees: fee, freeDeliveryAboveRupees: freeAboveText ? Number(freeAboveText) : null, allowedPostalCodes, taxRatePercent: taxRate,
      invoicePrefix: String(form.get("invoicePrefix") ?? "").trim() || "INV", invoiceFooter: nullable("invoiceFooter"),
      allowCashOnPickup: form.get("allowCashOnPickup") === "on", visitCapacity: Number(form.get("visitCapacity") ?? 3), pickupCapacity: Number(form.get("pickupCapacity") ?? 5),
      visitReminderMinutes: ["reminder24h", "reminder2h", "reminder30m"].filter((key) => form.get(key) === "on").map((key) => key === "reminder24h" ? 1440 : key === "reminder2h" ? 120 : 30),
      pickupReminderMinutes: ["pickupReminder24h", "pickupReminder2h"].filter((key) => form.get(key) === "on").map((key) => key === "pickupReminder24h" ? 1440 : 120),
      appointmentOpenMinute: Number(String(form.get("appointmentOpenTime") ?? "10:00").split(":")[0]) * 60 + Number(String(form.get("appointmentOpenTime") ?? "10:00").split(":")[1]),
      appointmentCloseMinute: Number(String(form.get("appointmentCloseTime") ?? "20:00").split(":")[0]) * 60 + Number(String(form.get("appointmentCloseTime") ?? "20:00").split(":")[1]),
    };
    try {
      const response = await fetch("/api/owner/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save settings.");
      setMessage("Store settings saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save settings."); }
    finally { setBusy(false); }
  }

  return <form action={save} className="card-nrf mt-6 grid gap-4 p-5 sm:grid-cols-2">
    <h2 className="font-serif text-2xl sm:col-span-2">Business information</h2>
    <label className="grid gap-1 text-sm">Public store name<input name="storeName" required defaultValue={settings.storeName} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Legal name<input name="legalName" defaultValue={settings.legalName ?? ""} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Street address<input name="address" required defaultValue={settings.address} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">City<input name="city" required defaultValue={settings.city} className="input-nrf"/></label><label className="grid gap-1 text-sm">State<input name="state" required defaultValue={settings.state} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Postal code<input name="postalCode" required defaultValue={settings.postalCode} className="input-nrf"/></label><label className="grid gap-1 text-sm">Business phone<input name="phone" defaultValue={settings.phone ?? ""} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Business email<input name="email" type="email" defaultValue={settings.email ?? ""} className="input-nrf"/></label><label className="grid gap-1 text-sm">GSTIN<input name="gstin" defaultValue={settings.gstin ?? ""} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Opening hours (JSON object)<textarea name="openingHours" rows={3} defaultValue={hours} className="input-nrf" placeholder={'{"Monday":"10:00–20:00","2026-12-25":"Closed"}'}/><span className="text-xs text-[var(--muted)]">Use weekday names and 24-hour times. Add a YYYY-MM-DD key with “Closed” for a holiday. Customer availability and server-side booking checks use these values.</span></label>
    <h2 className="mt-3 font-serif text-2xl sm:col-span-2">Delivery and tax</h2>
    <label className="grid gap-1 text-sm">Standard delivery fee (₹)<input name="deliveryFee" type="number" min="0" max="10000000" step="0.01" defaultValue={((delivery.feePaise ?? 0) / 100).toFixed(2)} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Free delivery above (₹)<input name="freeDeliveryAbove" type="number" min="0.01" max="10000000" step="0.01" defaultValue={delivery.freeAbovePaise == null ? "" : (delivery.freeAbovePaise / 100).toFixed(2)} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Delivery postal codes (optional allowlist)<textarea name="allowedPostalCodes" rows={2} defaultValue={(delivery.allowedPostalCodes ?? []).join(", ")} className="input-nrf" placeholder="486661, 486662"/><span className="text-xs text-[var(--muted)]">Leave blank to serve all postal codes. Use comma or line breaks.</span></label>
    <label className="grid gap-1 text-sm">Tax rate (%)<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={((tax.rateBps ?? 0) / 100).toFixed(2)} className="input-nrf"/></label>
    <label className="flex items-center gap-2 text-sm"><input name="codEnabled" type="checkbox" defaultChecked={cod}/> Enable Cash on Delivery</label>
    <h2 className="mt-3 font-serif text-2xl sm:col-span-2">Store visits and pickup</h2>
    <label className="grid gap-1 text-sm">Appointment opening time<input name="appointmentOpenTime" type="time" defaultValue={`${String(Math.floor(settings.appointmentOpenMinute / 60)).padStart(2,"0")}:${String(settings.appointmentOpenMinute % 60).padStart(2,"0")}`} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Appointment closing time<input name="appointmentCloseTime" type="time" defaultValue={`${String(Math.floor(settings.appointmentCloseMinute / 60)).padStart(2,"0")}:${String(settings.appointmentCloseMinute % 60).padStart(2,"0")}`} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Maximum store visits per hour<input name="visitCapacity" type="number" min="1" max="100" defaultValue={settings.visitCapacity} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Maximum pickups per hour<input name="pickupCapacity" type="number" min="1" max="100" defaultValue={settings.pickupCapacity} className="input-nrf"/></label>
    <div className="grid gap-2 text-sm sm:col-span-2"><p>Visit reminders</p><label className="flex items-center gap-2"><input type="checkbox" name="reminder24h" defaultChecked={settings.visitReminderMinutes.includes(1440)}/>24 hours before</label><label className="flex items-center gap-2"><input type="checkbox" name="reminder2h" defaultChecked={settings.visitReminderMinutes.includes(120)}/>2 hours before</label><label className="flex items-center gap-2"><input type="checkbox" name="reminder30m" defaultChecked={settings.visitReminderMinutes.includes(30)}/>30 minutes before</label></div>
    <div className="grid gap-2 text-sm sm:col-span-2"><p>Pickup reminders</p><label className="flex items-center gap-2"><input type="checkbox" name="pickupReminder24h" defaultChecked={settings.pickupReminderMinutes.includes(1440)}/>24 hours before</label><label className="flex items-center gap-2"><input type="checkbox" name="pickupReminder2h" defaultChecked={settings.pickupReminderMinutes.includes(120)}/>2 hours before</label></div>
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input name="allowCashOnPickup" type="checkbox" defaultChecked={settings.allowCashOnPickup}/> Enable Cash on Pickup (confirmed by Staff at handover)</label>
    <h2 className="mt-3 font-serif text-2xl sm:col-span-2">Invoice details</h2>
    <label className="grid gap-1 text-sm">Invoice number prefix<input name="invoicePrefix" maxLength={20} defaultValue={invoice.prefix ?? "INV"} className="input-nrf"/></label>
    <label className="grid gap-1 text-sm">Invoice footer<input name="invoiceFooter" maxLength={500} defaultValue={invoice.footer ?? ""} className="input-nrf"/></label>
    <h2 className="mt-3 font-serif text-2xl sm:col-span-2">Store policies</h2>
    {([["policyShipping", "Shipping policy"], ["policyReturns", "Returns and refund policy"], ["policyPrivacy", "Privacy policy"], ["policyTerms", "Terms and conditions"]] as const).map(([name, label]) => <label key={name} className="grid gap-1 text-sm sm:col-span-2">{label}<textarea name={name} rows={3} defaultValue={settings[name] ?? ""} className="input-nrf"/></label>)}
    <div className="flex items-center gap-3 sm:col-span-2"><button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save settings"}</button>{message && <span aria-live="polite" className="text-sm">{message}</span>}</div>
  </form>;
}
