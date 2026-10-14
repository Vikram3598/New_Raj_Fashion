import Link from "next/link";
import { StoreVisitForm } from "@/components/storefront/store-visit-form";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan Your Store Visit" };

export default async function StoreVisitPage() {
  const [products, user] = await Promise.all([
    prisma.product.findMany({ where: { status: "PUBLISHED" }, orderBy: { name: "asc" }, take: 100, include: { category: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1 }, variants: { where: { isActive: true }, select: { id: true, title: true, size: true, colour: true } } } }),
    getSessionUser(),
  ]);
  let initialName = ""; let initialPhone = ""; let initialEmail = "";
  if (user) {
    const profile = await prisma.userProfile.findUnique({ where: { userId: user.id }, select: { fullName: true } });
    const identities = await prisma.userIdentity.findMany({ where: { userId: user.id, verifiedAt: { not: null }, type: { in: ["PHONE", "EMAIL"] } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
    initialName = profile?.fullName ?? user.username;
    initialPhone = identities.find((identity) => identity.type === "PHONE")?.valueNormalized ?? "";
    initialEmail = identities.find((identity) => identity.type === "EMAIL")?.valueNormalized ?? "";
  }
  return <div className="container-nrf py-10">
    <div className="mx-auto max-w-3xl"><p className="text-xs uppercase tracking-[.2em] text-maroon-700">Gandhi Chowk · Sidhi</p><h1 className="mt-2 font-serif text-4xl sm:text-5xl">Plan Your Store Visit</h1><p className="mt-4 text-[var(--muted)]">Prepare your shopping requirements online and let the team check products before you arrive. A store visit is not an online order and does not reserve stock.</p><div className="mt-5 rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm dark:border-gold-900 dark:bg-stone-900">Optional token money: ₹10 per group. Tell the team how many people are coming. This request is for an in-person visit and has no online payment step.</div><div className="mt-5 flex flex-wrap gap-3 text-sm"><Link href="/account/store-visits" className="text-maroon-700">View my store visits</Link><Link href="/contact" className="text-maroon-700">Contact the showroom</Link></div></div>
    <div className="mx-auto mt-8 max-w-3xl"><StoreVisitForm products={products} initialName={initialName} initialPhone={initialPhone} initialEmail={initialEmail} guest={!user} /></div>
  </div>;
}
