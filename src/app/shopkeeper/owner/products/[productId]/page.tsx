import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ProductStatusEditor } from "@/components/shopkeeper/product-status-editor";
import { VariantEditor } from "@/components/shopkeeper/variant-editor";
import { ProductDetailsEditor } from "@/components/shopkeeper/product-details-editor";
import { ProductImageManager } from "@/components/shopkeeper/product-image-manager";

export default async function ProductDetail({ params }: { params: Promise<{ productId: string }> }) {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/products"); }
  const { productId } = await params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, include: { category: true, images: { orderBy: { sortOrder: "asc" } }, variants: { orderBy: { createdAt: "asc" } }, changeHistory: { orderBy: { createdAt: "desc" }, take: 8 } } }),
    prisma.category.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!product) notFound();
  return <main className="container-nrf max-w-4xl py-10">
    <Link href="/shopkeeper/owner/products" className="text-sm text-maroon-700">← Products</Link>
    <h1 className="mt-2 font-serif text-4xl">{product.name}</h1>
    <p className="mt-2 text-sm text-[var(--muted)]">SKU {product.sku} · {product.category?.name ?? "Uncategorized"} · {product.slug}</p>
    <section className="card-nrf mt-6 p-5"><h2 className="mb-4 font-serif text-2xl">Publication</h2><ProductStatusEditor productId={product.id} status={product.status} /></section>
    <ProductDetailsEditor product={product} categories={categories} />
    <ProductImageManager productId={product.id} initialImages={product.images} />
    <section className="mt-6"><h2 className="font-serif text-2xl">Variants and inventory</h2><p className="my-2 text-sm text-[var(--muted)]">Stock edits are recorded in inventory history.</p><div className="mt-4 grid gap-3">{product.variants.map((variant) => <VariantEditor key={variant.id} variant={variant} />)}</div></section>
    <section className="card-nrf mt-6 p-5"><h2 className="font-serif text-2xl">Product history</h2>{product.changeHistory.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No changes recorded yet.</p> : <ul className="mt-3 space-y-2">{product.changeHistory.map((change) => <li key={change.id} className="text-sm">{change.summary}<span className="ml-2 text-xs text-[var(--muted)]">{change.createdAt.toLocaleString("en-IN")}</span></li>)}</ul>}</section>
  </main>;
}
