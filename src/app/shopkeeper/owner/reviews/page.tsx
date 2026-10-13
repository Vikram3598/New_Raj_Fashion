import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ReviewModerator } from "@/components/shopkeeper/review-moderator";

export const metadata = { title: "Product reviews · Owner" };

export default async function OwnerReviewsPage() {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/reviews"); }
  const rows = await prisma.productReview.findMany({ take: 100, orderBy: { createdAt: "desc" }, include: { product: { select: { name: true } }, user: { select: { username: true } } } });
  const reviews = rows.map((review) => ({ id: review.id, rating: review.rating, title: review.title, body: review.body, published: review.published, createdAt: review.createdAt.toISOString(), productName: review.product.name, username: review.user.username }));
  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Product reviews</h1><p className="mt-2 text-sm text-[var(--muted)]">Only verified customers can submit reviews; approval is required before publication.</p><ReviewModerator reviews={reviews}/></main>;
}
