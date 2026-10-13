import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/storefront/product-card";
import { ShopFilters } from "@/components/storefront/shop-filters";

export const metadata = { title: "Shop" };

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "newest";
  const colour = typeof sp.colour === "string" ? sp.colour : "";
  const size = typeof sp.size === "string" ? sp.size : "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const take = 12;
  const skip = (page - 1) * take;

  const where = {
    status: "PUBLISHED" as const,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
            { category: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    variants: {
      some: {
        isActive: true,
        ...(colour ? { colour: { equals: colour, mode: "insensitive" as const } } : {}),
        ...(size ? { size: { equals: size, mode: "insensitive" as const } } : {}),
      },
    },
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { images: { orderBy: { sortOrder: "asc" } }, variants: true },
      orderBy: sort === "price-asc" || sort === "price-desc" ? { createdAt: "desc" } : { createdAt: "desc" },
      skip,
      take,
    }),
  ]);

  const sorted = [...products].sort((a, b) => {
    const pa = Math.min(...a.variants.map((v) => v.pricePaise));
    const pb = Math.min(...b.variants.map((v) => v.pricePaise));
    if (sort === "price-asc") return pa - pb;
    if (sort === "price-desc") return pb - pa;
    return 0;
  });

  return (
    <div className="container-nrf py-10">
      <h1 className="font-serif text-4xl">Shop</h1>
      <ShopFilters />
      {sorted.length === 0 ? (
        <p className="mt-10 text-[var(--muted)]">No products match this search. Try a different keyword or clear filters.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {sorted.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
      <p className="mt-6 text-sm text-[var(--muted)]">
        Page {page} of {Math.max(1, Math.ceil(total / take))}
      </p>
    </div>
  );
}
