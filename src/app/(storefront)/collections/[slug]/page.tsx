export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/storefront/product-card";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await prisma.collection.findFirst({ where: { slug, published: true }, select: { name: true, description: true } });
  return collection ? { title: collection.name, description: collection.description ?? undefined } : { title: "Collection" };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await prisma.collection.findFirst({ where: { slug, published: true }, include: { products: { where: { product: { status: "PUBLISHED" } }, include: { product: { include: { images: { orderBy: { sortOrder: "asc" } }, variants: true } } } } } });
  if (!collection) notFound();
  const products = collection.products.map((entry) => entry.product);
  return <div className="container-nrf py-10"><p className="text-sm text-[var(--muted)]">Featured collection</p><h1 className="mt-1 font-serif text-4xl">{collection.name}</h1>{collection.description ? <p className="mt-3 max-w-2xl text-[var(--muted)]">{collection.description}</p> : null}{products.length ? <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="card-nrf mt-8 p-8 text-center text-sm text-[var(--muted)]">Products will appear here when the owner adds them to this collection.</p>}</div>;
}
