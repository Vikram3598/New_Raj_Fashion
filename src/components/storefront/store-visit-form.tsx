"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/locale-provider";

type Product = { id: string; name: string; nameHi?: string | null; sku: string; category?: { name: string } | null; images: { url: string; alt: string; altHi?: string | null }[]; variants: { id: string; title: string; size: string | null; colour: string | null }[] };
type VisitItem = { productId: string; productName: string; variantId: string; size: string; colour: string; material: string; quantity: number; budgetRupees: string; instructions: string };
const blankItem = (): VisitItem => ({ productId: "", productName: "", variantId: "", size: "", colour: "", material: "", quantity: 1, budgetRupees: "", instructions: "" });
const purposeLabels: Record<string, { en: string; hi: string }> = {
  WEDDING: { en: "Wedding shopping", hi: "शादी की खरीदारी" }, BRIDAL: { en: "Bridal collection", hi: "दुल्हन का कलेक्शन" }, GROOM: { en: "Groom wear", hi: "दूल्हे के कपड़े" },
  FAMILY: { en: "Family shopping", hi: "परिवार की खरीदारी" }, SAREE: { en: "Saree selection", hi: "साड़ी का चयन" }, SUITING: { en: "Suiting and shirting", hi: "सूटिंग और शर्टिंग" },
  KIDS: { en: "Kids' clothing", hi: "बच्चों के कपड़े" }, GENERAL: { en: "General shopping", hi: "सामान्य खरीदारी" }, OTHER: { en: "Other", hi: "अन्य" },
};
function todayInIndia() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export function StoreVisitForm({ products, initialName = "", initialPhone = "", initialEmail = "", guest = true }: { products: Product[]; initialName?: string; initialPhone?: string; initialEmail?: string; guest?: boolean }) {
  const { locale } = useLocale();
  const [date, setDate] = useState(todayInIndia());
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<{ time: string; available: number; closed: boolean }[]>([]);
  const [items, setItems] = useState<VisitItem[]>([blankItem()]);
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ reference: string; date: string; message: string } | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [customerType, setCustomerType] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [purpose, setPurpose] = useState("GENERAL");
  const T = (en: string, hi: string) => locale === "hi" ? hi : en;

  useEffect(() => {
    fetch(`/api/store-visits/availability?date=${encodeURIComponent(date)}&kind=VISIT`).then((response) => response.json()).then((data) => setSlots(data.slots ?? [])).catch(() => setSlots([]));
  }, [date]);
  useEffect(() => {
    try {
      const draft = localStorage.getItem("nrf-store-visit-draft");
      if (draft) {
        const savedDraft = JSON.parse(draft) as { values?: Record<string, string>; items?: VisitItem[]; referenceImageUrl?: string };
        if (Array.isArray(savedDraft.items) && savedDraft.items.length) setItems(savedDraft.items);
        if (savedDraft.referenceImageUrl) setReferenceImageUrl(savedDraft.referenceImageUrl);
        if (savedDraft.values) {
          if (savedDraft.values.date) setDate(savedDraft.values.date);
          if (savedDraft.values.time) setTime(savedDraft.values.time);
          if (savedDraft.values.purpose) setPurpose(savedDraft.values.purpose);
          if (savedDraft.values.customerType) setCustomerType(savedDraft.values.customerType);
          requestAnimationFrame(() => {
            const form = document.querySelector<HTMLFormElement>("#store-visit-form");
            if (!form) return;
            for (const [key, fieldValue] of Object.entries(savedDraft.values ?? {})) {
              const field = form.elements.namedItem(key);
              if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = fieldValue === "on";
              else if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.value = fieldValue;
            }
          });
        }
      }
      const productId = new URLSearchParams(window.location.search).get("product");
      if (productId && products.some((product) => product.id === productId)) setItems([ { ...blankItem(), productId } ]);
    } catch { /* Ignore malformed browser drafts and start with a clean proforma. */ }
  }, [products]);
  const minimumDate = useMemo(() => todayInIndia(), []);

  function updateItem(index: number, value: Partial<VisitItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...value } : item));
  }
  function chooseProduct(index: number, productId: string) {
    const product = products.find((entry) => entry.id === productId);
    updateItem(index, { productId, variantId: "", size: "", colour: "", material: "" });
    if (!product) return;
  }
  function saveDraft() {
    const form = document.querySelector<HTMLFormElement>("#store-visit-form");
    if (!form) return;
    const values = Object.fromEntries(new FormData(form).entries());
    localStorage.setItem("nrf-store-visit-draft", JSON.stringify({ values, items, referenceImageUrl }));
    setDraftSaved(true);
    window.setTimeout(() => setDraftSaved(false), 3000);
  }
  async function sendGuestCode() {
    const form = document.querySelector<HTMLFormElement>("#store-visit-form");
    if (!form) return;
    const values = new FormData(form);
    setSendingCode(true); setError(""); setVerificationId(""); setVerificationCode("");
    try {
      const response = await fetch("/api/store-visits/verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: values.get("phone"), email: values.get("email") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? T("Could not send a verification code.", "सत्यापन कोड नहीं भेजा जा सका।"));
      setVerificationId(body.verificationId);
      if (body.devCode) setVerificationCode(body.devCode);
    } catch (e) { setError(e instanceof Error ? e.message : T("Could not send a verification code.", "सत्यापन कोड नहीं भेजा जा सका।")); }
    finally { setSendingCode(false); }
  }
  async function uploadImage(file?: File) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const data = new FormData(); data.set("file", file);
      const response = await fetch("/api/store-visits/reference-image", { method: "POST", body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? T("Image upload failed.", "चित्र अपलोड नहीं हुआ।"));
      setReferenceImageUrl(body.url);
    } catch (e) { setError(e instanceof Error ? e.message : T("Image upload failed.", "चित्र अपलोड नहीं हुआ।")); }
    finally { setUploading(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const number = (key: string) => { const value = String(form.get(key) ?? "").trim(); return value ? Number(value) : undefined; };
    const body = {
      customerName: String(form.get("customerName") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""),
      verificationId: verificationId || undefined, verificationCode: verificationCode || undefined,
      preferredContact: String(form.get("preferredContact") ?? "PHONE"), existingCustomerId: String(form.get("existingCustomerId") ?? ""), customerType: customerType || undefined,
      peopleCount: number("peopleCount"), durationMinutes: number("durationMinutes"), date, time, purpose, language: locale,
      totalBudgetRupees: number("totalBudgetRupees"), itemBudgetRupees: number("itemBudgetRupees"), familyMembers: number("familyMembers"),
      preferredBrands: String(form.get("preferredBrands") ?? ""), clothingType: String(form.get("clothingType") ?? "") || undefined,
      stitchingRequired: form.get("stitchingRequired") === "on", preferences: String(form.get("preferences") ?? ""), referenceImageUrl: referenceImageUrl || undefined,
      generalRequirement: String(form.get("generalRequirement") ?? ""),
      items: items.filter((item) => item.productId || item.productName.trim()).map((item) => ({ productId: item.productId || undefined, productName: item.productName.trim() || undefined, variantId: item.variantId || undefined, size: item.size || undefined, colour: item.colour || undefined, material: item.material || undefined, quantity: Number(item.quantity), budgetRupees: item.budgetRupees ? Number(item.budgetRupees) : undefined, instructions: item.instructions || undefined })),
    };
    try {
      const response = await fetch("/api/store-visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? T("The request could not be saved.", "अनुरोध सहेजा नहीं जा सका।"));
      localStorage.removeItem("nrf-store-visit-draft");
      setResult({ reference: data.visit.reference, date: new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(data.visit.date)), message: data.message });
    } catch (e) { setError(e instanceof Error ? e.message : T("The request could not be saved.", "अनुरोध सहेजा नहीं जा सका।")); }
    finally { setBusy(false); }
  }

  if (result) return <section className="card-nrf p-6 print:border-0 print:shadow-none">
    <p className="text-sm font-medium text-green-700">{T("Request received", "अनुरोध प्राप्त हुआ")}</p>
    <h2 className="mt-2 font-serif text-3xl">{T("Store visit proforma", "दुकान पर आने का प्रपत्र")}</h2>
    <p className="mt-4">{T("Reference number", "संदर्भ संख्या")}: <strong>{result.reference}</strong></p>
    <p className="mt-2">{T("Requested arrival", "आगमन का अनुरोधित समय")}: {result.date}</p>
    <p className="mt-3 text-sm text-[var(--muted)]">{T("The requested time is not confirmed until the store checks availability. No products have been reserved. Contact the store if your arrival time changes.", "दुकान द्वारा उपलब्धता जाँचने तक अनुरोधित समय की पुष्टि नहीं होती। कोई उत्पाद आरक्षित नहीं किया गया है। आगमन का समय बदलने पर दुकान से संपर्क करें।")}</p>
    <div className="mt-6 flex flex-wrap gap-3 print:hidden"><button className="btn-secondary" onClick={() => window.print()}>{T("Print proforma", "प्रपत्र प्रिंट करें")}</button><a className="btn-primary" href="/account/store-visits">{T("My store visits", "मेरी दुकान बुकिंग")}</a><button className="btn-secondary" onClick={() => setResult(null)}>{T("Make another request", "एक और अनुरोध करें")}</button></div>
  </section>;

  return <form id="store-visit-form" className="grid gap-7" onSubmit={submit}>
    <section className="card-nrf grid gap-4 p-5 sm:grid-cols-2">
      <h2 className="font-serif text-2xl sm:col-span-2">{T("Your contact details", "आपकी संपर्क जानकारी")}</h2>
      <label className="grid gap-1 text-sm">{T("Customer name", "ग्राहक का नाम")}<input required name="customerName" maxLength={120} className="input-nrf" defaultValue={initialName} /></label>
      <label className="grid gap-1 text-sm">{T("Phone number", "फ़ोन नंबर")}<input required name="phone" type="tel" maxLength={20} className="input-nrf" defaultValue={initialPhone} onChange={() => { setVerificationId(""); setVerificationCode(""); }} /></label>
      <label className="grid gap-1 text-sm">{T("Email (optional)", "ईमेल (वैकल्पिक)")}<input name="email" type="email" maxLength={254} className="input-nrf" defaultValue={initialEmail} onChange={() => { setVerificationId(""); setVerificationCode(""); }} /></label>
      <label className="grid gap-1 text-sm">{T("Preferred contact", "संपर्क का पसंदीदा तरीका")}<select name="preferredContact" className="input-nrf"><option value="PHONE">{T("Phone", "फ़ोन")}</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select></label>
      <label className="grid gap-1 text-sm">{T("Customer type", "ग्राहक प्रकार")}<select value={customerType} onChange={(e) => setCustomerType(e.target.value)} className="input-nrf"><option value="">{T("Not sure", "पता नहीं")}</option><option value="NEW">{T("New customer", "नया ग्राहक")}</option><option value="RETURNING">{T("Returning customer", "पुराना ग्राहक")}</option></select></label>
      <label className="grid gap-1 text-sm">{T("Existing customer ID (optional)", "मौजूदा ग्राहक आईडी (वैकल्पिक)")}<input name="existingCustomerId" maxLength={40} className="input-nrf" /></label>
    </section>

    {guest ? <section className="card-nrf grid gap-3 p-5 sm:grid-cols-2"><h2 className="font-serif text-2xl sm:col-span-2">{T("Verify your contact", "अपना संपर्क सत्यापित करें")}</h2><p className="text-sm text-[var(--muted)] sm:col-span-2">{T("We will send a one-time code to your email, or by SMS if no email is entered. Sign-in is not required.", "ईमेल पर एक बार का कोड भेजेंगे; ईमेल न देने पर SMS से भेजा जाएगा। लॉगिन आवश्यक नहीं है।")}</p><button type="button" className="btn-secondary justify-self-start" onClick={() => void sendGuestCode()} disabled={sendingCode}>{sendingCode ? T("Sending code…", "कोड भेज रहे हैं…") : T("Send verification code", "सत्यापन कोड भेजें")}</button>{verificationId ? <label className="grid gap-1 text-sm">{T("Six-digit verification code", "छह अंकों का सत्यापन कोड")}<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} className="input-nrf" required /></label> : null}</section> : null}

    <section className="card-nrf grid gap-4 p-5 sm:grid-cols-2">
      <h2 className="font-serif text-2xl sm:col-span-2">{T("Visit details", "आने की जानकारी")}</h2>
      <label className="grid gap-1 text-sm">{T("Preferred date", "पसंदीदा तारीख")}<input required type="date" min={minimumDate} value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">{T("Arrival time slot", "आने का समय")}<select required value={time} onChange={(e) => setTime(e.target.value)} className="input-nrf"><option value="">{T("Choose an available time", "उपलब्ध समय चुनें")}</option>{slots.filter((slot) => slot.available > 0 && !slot.closed).map((slot) => <option key={slot.time} value={slot.time}>{slot.time} — {slot.available} {T("spaces", "स्थान उपलब्ध")}</option>)}</select></label>
      <label className="grid gap-1 text-sm">{T("Purpose", "आने का उद्देश्य")}<select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="input-nrf">{Object.entries(purposeLabels).map(([key, value]) => <option key={key} value={key}>{locale === "hi" ? value.hi : value.en}</option>)}</select></label>
      <label className="grid gap-1 text-sm">{T("Number of people", "लोगों की संख्या")}<input name="peopleCount" type="number" min={1} max={30} className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">{T("Estimated shopping time (minutes)", "खरीदारी का अनुमानित समय (मिनट)")}<input name="durationMinutes" type="number" min={15} max={360} step={15} className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">{T("Family members shopping", "खरीदारी करने वाले परिवार के सदस्य")}<input name="familyMembers" type="number" min={1} max={30} className="input-nrf" /></label>
    </section>

    <section className="card-nrf grid gap-4 p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="font-serif text-2xl">{T("Product requirements", "उत्पाद की ज़रूरतें")}</h2><button type="button" className="btn-secondary !min-h-9 !px-3" onClick={() => setItems((current) => [...current, blankItem()])}>{T("Add Another Product", "एक और उत्पाद जोड़ें")}</button></div>
      {items.map((item, index) => {
        const selected = products.find((product) => product.id === item.productId);
        return <div key={index} className="grid gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-700 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">{T("Select a catalogue product (optional)", "कैटलॉग से उत्पाद चुनें (वैकल्पिक)")}<select value={item.productId} onChange={(e) => chooseProduct(index, e.target.value)} className="input-nrf"><option value="">{T("Describe a product instead", "उत्पाद का विवरण लिखें")}</option>{products.map((product) => <option key={product.id} value={product.id}>{locale === "hi" && product.nameHi ? product.nameHi : product.name}{product.category?.name ? ` — ${product.category.name}` : ""}</option>)}</select></label>
          {!item.productId ? <label className="grid gap-1 text-sm sm:col-span-2">{T("Product or requirement name", "उत्पाद या आवश्यकता का नाम")}<input value={item.productName} onChange={(e) => updateItem(index, { productName: e.target.value })} maxLength={180} className="input-nrf" placeholder={T("For example: silk saree", "उदाहरण: रेशमी साड़ी")} /></label> : null}
          {selected?.images[0] && <div className="relative aspect-[3/1] overflow-hidden rounded-lg sm:col-span-2"><Image src={selected.images[0].url} alt={(locale === "hi" && selected.images[0].altHi ? selected.images[0].altHi : selected.images[0].alt) || selected.name} fill sizes="100vw" className="object-cover" unoptimized /></div>}
          <label className="grid gap-1 text-sm">{T("Size preference", "पसंदीदा साइज़")}<input value={item.size} onChange={(e) => updateItem(index, { size: e.target.value })} maxLength={40} className="input-nrf" /></label>
          <label className="grid gap-1 text-sm">{T("Colour preference", "पसंदीदा रंग")}<input value={item.colour} onChange={(e) => updateItem(index, { colour: e.target.value })} maxLength={60} className="input-nrf" /></label>
          <label className="grid gap-1 text-sm">{T("Fabric or material", "कपड़ा या सामग्री")}<input value={item.material} onChange={(e) => updateItem(index, { material: e.target.value })} maxLength={80} className="input-nrf" /></label>
          <label className="grid gap-1 text-sm">{T("Quantity", "मात्रा")}<input value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} type="number" min={1} max={20} className="input-nrf" /></label>
          <label className="grid gap-1 text-sm">{T("Budget per item (₹)", "प्रति वस्तु बजट (₹)")}<input value={item.budgetRupees} onChange={(e) => updateItem(index, { budgetRupees: e.target.value })} type="number" min={0} step="100" className="input-nrf" /></label>
          <label className="grid gap-1 text-sm">{T("Special instructions", "विशेष निर्देश")}<input value={item.instructions} onChange={(e) => updateItem(index, { instructions: e.target.value })} maxLength={1000} className="input-nrf" /></label>
          {items.length > 1 && <button type="button" className="justify-self-start text-sm text-red-700 sm:col-span-2" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>{T("Remove product", "उत्पाद हटाएँ")}</button>}
        </div>;
      })}
      <label className="grid gap-1 text-sm">{T("Or describe a general shopping requirement", "या अपनी सामान्य खरीदारी की ज़रूरत बताएँ")}<textarea name="generalRequirement" rows={3} maxLength={2000} className="input-nrf" placeholder={T("Example: Wedding sarees for my family within ₹25,000", "उदाहरण: मेरे परिवार के लिए ₹25,000 के भीतर शादी की साड़ियाँ")} /></label>
    </section>

    <section className="card-nrf grid gap-4 p-5 sm:grid-cols-2">
      <h2 className="font-serif text-2xl sm:col-span-2">{T("Budget and preferences", "बजट और पसंद")}</h2>
      <label className="grid gap-1 text-sm">{T("Total estimated budget (₹)", "कुल अनुमानित बजट (₹)")}<input name="totalBudgetRupees" type="number" min={0} step="500" className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">{T("Preferred brands", "पसंदीदा ब्रांड")}<input name="preferredBrands" maxLength={300} className="input-nrf" /></label>
      <label className="grid gap-1 text-sm">{T("Ready-made or fabric", "तैयार कपड़े या कपड़ा")}<select name="clothingType" className="input-nrf"><option value="EITHER">{T("Either", "कोई भी")}</option><option value="READY_MADE">{T("Ready-made clothing", "तैयार कपड़े")}</option><option value="FABRIC">{T("Fabric", "कपड़ा")}</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input name="stitchingRequired" type="checkbox" />{T("Stitching or alteration required", "सिलाई या बदलाव की ज़रूरत")}</label>
      <label className="grid gap-1 text-sm sm:col-span-2">{T("Additional preferences or assistance", "अतिरिक्त पसंद या सहायता")}<textarea name="preferences" rows={3} maxLength={2000} className="input-nrf" /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">{T("Reference image (optional, JPEG/PNG/WebP/AVIF, max 5 MB)", "संदर्भ चित्र (वैकल्पिक, JPEG/PNG/WebP/AVIF, अधिकतम 5 MB)")}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => void uploadImage(e.target.files?.[0])} className="block w-full text-sm" />{uploading ? <span>{T("Uploading securely...", "सुरक्षित रूप से अपलोड हो रहा है...")}</span> : referenceImageUrl ? <span className="text-green-700">{T("Reference image attached", "संदर्भ चित्र संलग्न है")}</span> : null}</label>
      <p className="text-xs text-[var(--muted)] sm:col-span-2">{T("Budgets and preferences are indicative only. This request does not reserve stock or provide a final quotation. The store will confirm the requested time after checking capacity.", "बजट और पसंद केवल अनुमानित हैं। यह अनुरोध स्टॉक आरक्षित नहीं करता और न ही अंतिम मूल्य बताता है। उपलब्धता जाँचने के बाद दुकान समय की पुष्टि करेगी।")}</p>
    </section>

    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
    {draftSaved ? <p role="status" className="text-sm text-green-700">{T("Draft saved in this browser.", "ड्राफ़्ट इस ब्राउज़र में सहेजा गया।")}</p> : null}
    <div className="flex flex-wrap gap-3"><button type="button" className="btn-secondary" onClick={saveDraft}>{T("Save as Draft", "ड्राफ़्ट के रूप में सहेजें")}</button><button type="submit" className="btn-primary" disabled={busy || uploading || (guest && (!verificationId || verificationCode.length !== 6))}>{busy ? T("Submitting...", "भेजा जा रहा है...") : T("Submit Store Visit Request", "दुकान आने का अनुरोध भेजें")}</button></div>
  </form>;
}
