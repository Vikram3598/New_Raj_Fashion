export const dynamic = "force-dynamic";
import { getStoreSettings } from "@/lib/store";

export const metadata = { title: "About the store" };

export default async function AboutPage() {
  const settings = await getStoreSettings();
  return <div className="container-nrf py-12"><p className="text-sm uppercase tracking-[.2em] text-maroon-700">Gandhi Chowk · Sidhi</p><h1 className="mt-2 font-serif text-4xl">A local destination for fashion and occasion wear</h1><p className="mt-5 max-w-3xl leading-7">New Raj Fashion and Raj Saree Showroom serves customers looking for everyday clothing, traditional Indian wear, sarees, suiting and shirting, and wedding collections for the family.</p>{settings?.aboutHtml ? <p className="mt-4 max-w-3xl whitespace-pre-wrap leading-7 text-[var(--muted)]">{settings.aboutHtml}</p> : null}
    <section className="card-nrf mt-8 max-w-2xl p-5"><h2 className="font-serif text-2xl">Visit the showroom</h2><p className="mt-3 text-sm leading-6">{settings?.address ?? "Gandhi Chowk"}<br />{settings?.city ?? "Sidhi"}, {settings?.state ?? "Madhya Pradesh"} {settings?.postalCode ?? "486661"}</p>{settings?.openingHours && typeof settings.openingHours === "object" ? <div className="mt-4"><h3 className="text-sm font-medium">Opening hours</h3><dl className="mt-2 grid gap-1 text-sm">{Object.entries(settings.openingHours as Record<string, unknown>).map(([day, hours]) => <div key={day} className="flex justify-between gap-4"><dt>{day}</dt><dd>{String(hours)}</dd></div>)}</dl></div> : <p className="mt-3 text-xs text-[var(--muted)]">Opening hours have not been published.</p>}</section>
  </div>;
}
