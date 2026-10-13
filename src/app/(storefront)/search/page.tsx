export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/storefront/product-card";
import { ShopFilters } from "@/components/storefront/shop-filters";

export const metadata = { title: "Search products" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "newest";
  const colour = typeof sp.colour === "string" ? sp.colour.slice(0, 50) : "";
  const size = typeof sp.size === "string" ? sp.size.slice(0, 30) : "";
  const requestedPage = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const take = 12;
  const where = {
    status: "PUBLISHED" as const,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }, { category: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
    variants: { some: { isActive: true, ...(colour ? { colour: { equals: colour, mode: "insensitive" as const } } : {}), ...(size ? { size: { equals: size, mode: "insensitive" as const } } : {}) } },
  };
  const total = await prisma.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / take));
  const page = Math.min(requestedPage, pageCount);
  const products = await prisma.product.findMany({ where, include: { images: { orderBy: { sortOrder: "asc" } }, variants: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take });
  const sorted = [...products].sort((a, b) => {
    const priceA = Math.min(...a.variants.map((variant) => variant.pricePaise));
    const priceB = Math.min(...b.variants.map((variant) => variant.pricePaise));
    return sort === "price-asc" ? priceA - priceB : sort === "price-desc" ? priceB - priceA : 0;
  });
  return <div className="container-nrf py-10"><p className="text-sm text-[var(--muted)]">Search results</p><h1 className="mt-1 font-serif text-4xl">{q ? `“${q}”` : "All products"}</h1><ShopFilters key={`${q}-${sort}-${colour}-${size}`} basePath="/search" query={q} sort={sort} colour={colour} size={size} />
    {sorted.length ? <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{sorted.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="card-nrf mt-8 p-8 text-center"><p className="text-[var(--muted)]">No products match those filters.</p><Link href="/shop" className="btn-primary mt-4">Browse all products</Link></div>}
    {total > take ? <nav aria-label="Search result pages" className="mt-6 flex justify-between text-sm"><span>Page {page} of {pageCount}</span><div className="flex gap-4">{page > 1 ? <Link className="text-maroon-700" href={`/search?${new URLSearchParams({ q, sort, colour, size, page: String(page - 1) })}`}>Previous</Link> : null}{page < pageCount ? <Link className="text-maroon-700" href={`/search?${new URLSearchParams({ q, sort, colour, size, page: String(page + 1) })}`}>Next</Link> : null}</div></nav> : null}
  </div>;
}
