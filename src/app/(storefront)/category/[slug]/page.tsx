export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/storefront/product-card";
import { ShopFilters } from "@/components/storefront/shop-filters";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await prisma.category.findFirst({ where: { slug, published: true }, select: { name: true, description: true } });
  return category ? { title: category.name, description: category.description ?? `Shop ${category.name} at New Raj Fashion.` } : { title: "Category" };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const category = await prisma.category.findFirst({ where: { slug, published: true }, include: { children: { where: { published: true }, orderBy: { sortOrder: "asc" } } } });
  if (!category) notFound();
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "newest";
  const colour = typeof sp.colour === "string" ? sp.colour.slice(0, 50) : "";
  const size = typeof sp.size === "string" ? sp.size.slice(0, 30) : "";
  const requestedPage = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const take = 12;
  const ids = [category.id, ...category.children.map((child) => child.id)];
  const where = { status: "PUBLISHED" as const, categoryId: { in: ids }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}), variants: { some: { isActive: true, ...(colour ? { colour: { equals: colour, mode: "insensitive" as const } } : {}), ...(size ? { size: { equals: size, mode: "insensitive" as const } } : {}) } } };
  const total = await prisma.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / take));
  const page = Math.min(requestedPage, pageCount);
  const products = await prisma.product.findMany({ where, include: { images: { orderBy: { sortOrder: "asc" } }, variants: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take });
  const sorted = [...products].sort((a, b) => {
    const priceA = Math.min(...a.variants.map((variant) => variant.pricePaise)); const priceB = Math.min(...b.variants.map((variant) => variant.pricePaise));
    return sort === "price-asc" ? priceA - priceB : sort === "price-desc" ? priceB - priceA : 0;
  });
  const pageHref = (target: number) => { const query = new URLSearchParams({ q, sort, colour, size, page: String(target) }); return `/category/${slug}?${query}`; };
  return <div className="container-nrf py-10"><p className="text-sm text-[var(--muted)]">Shop by category</p><h1 className="mt-1 font-serif text-4xl">{category.name}</h1>{category.description ? <p className="mt-3 max-w-2xl text-[var(--muted)]">{category.description}</p> : null}
    {category.children.length ? <nav aria-label="Subcategories" className="mt-5 flex flex-wrap gap-2">{category.children.map((child) => <Link key={child.id} href={`/category/${child.slug}`} className="btn-secondary">{child.name}</Link>)}</nav> : null}
    <ShopFilters key={`${q}-${sort}-${colour}-${size}`} basePath={`/category/${slug}`} query={q} sort={sort} colour={colour} size={size} />
    {sorted.length ? <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{sorted.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="card-nrf mt-8 p-8 text-center text-sm text-[var(--muted)]">No products are available in this category yet.</p>}
    {total > take ? <nav aria-label="Category pages" className="mt-6 flex justify-between text-sm"><span>Page {page} of {pageCount}</span><div className="flex gap-4">{page > 1 ? <Link className="text-maroon-700" href={pageHref(page - 1)}>Previous</Link> : null}{page < pageCount ? <Link className="text-maroon-700" href={pageHref(page + 1)}>Next</Link> : null}</div></nav> : null}
  </div>;
}
