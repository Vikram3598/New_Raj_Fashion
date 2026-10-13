import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PromotionManager } from "@/components/shopkeeper/promotion-manager";

export const metadata = { title: "Promotions · Owner" };

export default async function OwnerPromotionsPage() {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/promotions"); }
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, code: true, description: true, percentOff: true, amountOffPaise: true, minSubtotalPaise: true, maxUses: true, usedCount: true, startsAt: true, endsAt: true, active: true } });
  return <main className="container-nrf py-10"><p className="text-xs uppercase tracking-[.2em] text-maroon-700">Owner workspace</p><h1 className="mt-2 font-serif text-4xl">Promotions</h1><p className="mt-2 text-sm text-[var(--muted)]">Create and pause coupon codes. Checkout validates each code again against current server-side rules.</p><div className="mt-7"><PromotionManager initialCoupons={coupons.map((coupon) => ({ ...coupon, startsAt: coupon.startsAt?.toISOString() ?? null, endsAt: coupon.endsAt?.toISOString() ?? null }))} /></div></main>;
}
