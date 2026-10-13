import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";
import { ProductCsvTools } from "@/components/shopkeeper/product-csv-tools";

export const metadata = { title: "Products · Owner" };

export default async function OwnerProducts() {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/products"); }
  const products = await prisma.product.findMany({ orderBy: { updatedAt: "desc" }, take: 100, include: { category: { select: { name: true } }, variants: { where: { isActive: true }, select: { pricePaise: true, stockOnHand: true, stockReserved: true } } } });
  return <main className="container-nrf py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><Link href="/shopkeeper/owner" className="text-sm text-maroon-700">← Owner overview</Link><h1 className="mt-2 font-serif text-4xl">Products</h1><p className="mt-2 text-sm text-[var(--muted)]">Catalogue editing is restricted to the Owner account.</p></div><Link href="/shopkeeper/owner/products/new" className="btn-primary"><Plus size={16}/> New product</Link></div>
    <ProductCsvTools/>
    <div className="card-nrf mt-7 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-[var(--muted)] dark:bg-stone-900"><tr><th className="p-4">Product</th><th className="p-4">Category</th><th className="p-4">Price from</th><th className="p-4">Available</th><th className="p-4">Status</th></tr></thead><tbody className="divide-y divide-stone-200 dark:divide-stone-800">{products.map((product) => { const price = product.variants.length ? Math.min(...product.variants.map((variant) => variant.pricePaise)) : 0; const available = product.variants.reduce((total, variant) => total + Math.max(0, variant.stockOnHand - variant.stockReserved), 0); return <tr key={product.id}><td className="p-4"><Link className="font-medium hover:text-maroon-700" href={`/shopkeeper/owner/products/${product.id}`}>{product.name}</Link><p className="mt-1 text-xs text-[var(--muted)]">{product.sku}</p></td><td className="p-4">{product.category?.name ?? "—"}</td><td className="p-4">{paiseToInr(price)}</td><td className="p-4">{available}</td><td className="p-4">{product.status}</td></tr>; })}</tbody></table>{!products.length && <p className="p-8 text-center text-sm text-[var(--muted)]">No products yet.</p>}</div>
  </main>;
}
