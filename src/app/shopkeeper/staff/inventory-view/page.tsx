import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { StaffStockCount } from "@/components/shopkeeper/staff-stock-count";

export const metadata = { title: "Inventory lookup · Staff" };

export default async function StaffInventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  let staff; try { staff = await requirePermission(PERMISSIONS.INVENTORY_READ); } catch { redirect("/shopkeeper/login"); }
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const parsedPage = Number(params.page ?? 1);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10000) : 1;
  const where = {
    isActive: true,
    product: { status: "PUBLISHED" as const },
    ...(query ? { OR: [
      { sku: { contains: query, mode: "insensitive" as const } },
      { barcode: { contains: query, mode: "insensitive" as const } },
      { product: { name: { contains: query, mode: "insensitive" as const } } },
      { product: { sku: { contains: query, mode: "insensitive" as const } } },
    ] } : {}),
  };
  const [variants, count] = await Promise.all([
    prisma.productVariant.findMany({ where, orderBy: [{ product: { name: "asc" } }, { title: "asc" }], skip: (page - 1) * 50, take: 50, include: { product: { select: { name: true, sku: true } } } }),
    prisma.productVariant.count({ where }),
  ]);
  const canAdjust = staff.permissions.includes(PERMISSIONS.INVENTORY_ADJUST);
  return <main className="container-nrf py-10"><Link href="/shopkeeper/staff/dashboard" className="text-sm text-maroon-700">← Staff dashboard</Link><h1 className="mt-2 font-serif text-4xl">Inventory lookup</h1><p className="mt-2 text-sm text-[var(--muted)]">Search published products by product name, SKU or barcode.{canAdjust ? " Your assigned permission allows you to record physical stock counts." : " Stock adjustments require explicit permission from the Owner."}</p>
    <form className="mt-5 flex max-w-xl gap-2"><label className="sr-only" htmlFor="inventory-q">Search inventory</label><input id="inventory-q" name="q" defaultValue={query} className="input-nrf" placeholder="Product, SKU or barcode"/><button className="btn-primary">Search</button></form>
    <div className="card-nrf mt-6 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-[var(--muted)] dark:bg-stone-900"><tr><th className="p-4">Product / variant</th><th className="p-4">Variant SKU</th><th className="p-4">On hand</th><th className="p-4">Reserved</th><th className="p-4">Available</th></tr></thead><tbody className="divide-y divide-stone-200 dark:divide-stone-800">{variants.map((variant) => <tr key={variant.id}><td className="p-4">{variant.product.name}<p className="mt-1 text-xs text-[var(--muted)]">{variant.title} · product {variant.product.sku}</p>{canAdjust && <StaffStockCount variantId={variant.id} stockOnHand={variant.stockOnHand} stockReserved={variant.stockReserved}/>}</td><td className="p-4">{variant.sku}{variant.barcode ? <p className="mt-1 text-xs text-[var(--muted)]">Barcode {variant.barcode}</p> : null}</td><td className="p-4">{variant.stockOnHand}</td><td className="p-4">{variant.stockReserved}</td><td className="p-4 font-medium">{Math.max(0, variant.stockOnHand - variant.stockReserved)}</td></tr>)}</tbody></table>{!variants.length && <p className="p-8 text-center text-sm text-[var(--muted)]">No matching inventory.</p>}</div>
    <div className="mt-4 flex justify-between text-sm">{page > 1 ? <Link href={`/shopkeeper/staff/inventory-view?q=${encodeURIComponent(query)}&page=${page - 1}`} className="text-maroon-700">Previous</Link> : <span/>}{page * 50 < count ? <Link href={`/shopkeeper/staff/inventory-view?q=${encodeURIComponent(query)}&page=${page + 1}`} className="text-maroon-700">Next</Link> : null}</div>
  </main>;
}
