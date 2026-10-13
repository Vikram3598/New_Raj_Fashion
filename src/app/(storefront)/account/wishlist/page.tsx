import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { WishlistManager } from "@/components/account/wishlist-manager";

export const metadata = { title: "My wishlist" };

export default async function WishlistPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const wishlist = await prisma.wishlist.findUnique({
    where: { userId: user.id },
    include: { items: { orderBy: { createdAt: "desc" }, include: { variant: { include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } } } } },
  });
  const items = (wishlist?.items ?? []).map(({ variant }) => ({
    variantId: variant.id, title: variant.title, pricePaise: variant.pricePaise,
    stockAvailable: Math.max(0, variant.stockOnHand - variant.stockReserved), productStatus: variant.product.status,
    productName: variant.product.name, productSlug: variant.product.slug,
    imageUrl: variant.product.images[0]?.url ?? null, imageAlt: variant.product.images[0]?.alt ?? null,
  }));
  return <div className="card-nrf p-5 sm:p-6"><h2 className="font-serif text-3xl">Your wishlist</h2><div className="mt-5"><WishlistManager initialItems={items} /></div></div>;
}
