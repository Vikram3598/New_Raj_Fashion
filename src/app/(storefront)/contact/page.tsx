export const dynamic = "force-dynamic";
import { getStoreSettings } from "@/lib/store";
import { ContactForm } from "@/components/storefront/contact-form";

export const metadata = { title: "Contact the showroom" };

export default async function ContactPage() {
  const settings = await getStoreSettings();
  return <div className="container-nrf py-12"><h1 className="font-serif text-4xl">Contact the showroom</h1><p className="mt-3 max-w-2xl text-[var(--muted)]">Visit New Raj Fashion and Raj Saree Showroom at Gandhi Chowk, Sidhi. Business contact details are shown here once configured by the owner.</p><section className="card-nrf mt-7 max-w-xl p-5"><h2 className="font-serif text-2xl">Store details</h2><address className="mt-3 not-italic text-sm leading-6">{settings?.address}, {settings?.city}, {settings?.state} {settings?.postalCode}</address>{settings?.phone ? <p className="mt-3 text-sm">Phone: <a className="text-maroon-700" href={`tel:${settings.phone}`}>{settings.phone}</a></p> : <p className="mt-3 text-sm text-[var(--muted)]">A phone number has not been published.</p>}{settings?.email ? <p className="mt-1 text-sm">Email: <a className="text-maroon-700" href={`mailto:${settings.email}`}>{settings.email}</a></p> : <p className="mt-1 text-sm text-[var(--muted)]">An email address has not been published.</p>}</section><ContactForm/></div>;
}
