import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { BannerManager } from "@/components/shopkeeper/banner-manager";

export const metadata = { title: "Banners · Owner" };

export default async function OwnerBannersPage() {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/banners"); }
  const banners = await prisma.promotionBanner.findMany({ orderBy: [{ slot: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }], select: { id: true, title: true, subtitle: true, imageUrl: true, href: true, slot: true, sortOrder: true, enabled: true, startsAt: true, endsAt: true } });
  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Promotional banners</h1><p className="mt-2 text-sm text-[var(--muted)]">Schedule hero and collection banners. Add verified store-owned image URLs after storage is configured.</p><div className="mt-7"><BannerManager initialBanners={banners.map((banner) => ({ ...banner, startsAt: banner.startsAt?.toISOString() ?? null, endsAt: banner.endsAt?.toISOString() ?? null }))} /></div></main>;
}
