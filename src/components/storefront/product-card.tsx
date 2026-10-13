import Image from "next/image";
import Link from "next/link";
import { paiseToInr } from "@/lib/money";
import { AddToWishlist } from "@/components/storefront/add-to-wishlist";

export type ProductCardData = {
  slug: string;
  name: string;
  images: { url: string; alt: string }[];
  variants: { id: string; pricePaise: number; mrpPaise: number | null; stockOnHand: number; stockReserved: number }[];
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const prices = product.variants.map((variant) => variant.pricePaise);
  const minimum = prices.length ? Math.min(...prices) : null;
  const available = product.variants.some((variant) => variant.stockOnHand - variant.stockReserved > 0);
  const image = product.images[0];
  return <article className="card-nrf relative overflow-hidden">
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] bg-gradient-to-br from-maroon-900 via-maroon-700 to-gold-700">
        {image ? <Image src={image.url} alt={image.alt || product.name} fill sizes="(max-width: 768px) 50vw, 25vw" unoptimized className="object-cover transition group-hover:scale-[1.02]" /> : <div className="flex h-full items-end p-4 font-serif text-2xl text-gold-100">{product.name}</div>}
      </div>
      <div className="p-3"><h3 className="line-clamp-2 text-sm font-medium">{product.name}</h3><p className="mt-1 text-sm">{minimum === null ? "Price unavailable" : paiseToInr(minimum)}</p><p className="mt-1 text-xs text-[var(--muted)]">{available ? "Available" : "Currently unavailable"}</p></div>
    </Link>
    <div className="absolute right-2 top-2"><AddToWishlist variantId={product.variants[0]?.id} /></div>
  </article>;
}
