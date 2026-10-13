import { getStoreSettings } from "@/lib/store";

type PolicyKey = "policyPrivacy" | "policyTerms" | "policyShipping" | "policyReturns";

export async function PolicyPage({ title, setting, fallback }: { title: string; setting: PolicyKey; fallback: string }) {
  const settings = await getStoreSettings();
  const text = settings?.[setting];
  return <div className="container-nrf py-12"><p className="text-sm text-[var(--muted)]">New Raj Fashion & Raj Saree Showroom</p><h1 className="mt-1 font-serif text-4xl">{title}</h1><p className="mt-6 max-w-4xl whitespace-pre-wrap leading-7">{text || fallback}</p></div>;
}
