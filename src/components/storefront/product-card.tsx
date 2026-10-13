import Link from "next/link";
import { paiseToInr } from "@/lib/money";

export type ProductCardData = {
  slug: string;
  name: string;
  images: { url: string; alt: string }[];
  variants: { pricePaise: number; mrpPaise: number | null; stockOnHand: number; stockReserved: number }[];
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const prices = product.variants.map((v) => v.pricePaise);
  const min = Math.min(...prices);
  const available = product.variants.some((v) => v.stockOnHand - v.stockReserved > 0);
  const img = product.images[0];
  return (
    <Link href={`/product/${product.slug}`} className="card-nrf group block overflow-hidden">
      <div className="relative aspect-[3/4] bg-gradient-to-br from-maroon-900 via-maroon-700 to-gold-700">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.alt || product.name} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full items-end p-4 font-serif text-2xl text-gold-100">{product.name}</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium">{product.name}</h3>
        <p className="mt-1 text-sm">{paiseToInr(min)}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{available ? "Available" : "Currently unavailable"}</p>
      </div>
    </Link>
  );
}
