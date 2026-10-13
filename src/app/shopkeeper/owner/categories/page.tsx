import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CategoryManager } from "@/components/shopkeeper/category-manager";

export const metadata = { title: "Categories · Owner" };

export default async function OwnerCategoriesPage() {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/categories"); }
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, description: true, parentId: true, sortOrder: true, published: true, updatedAt: true } });
  return <main className="container-nrf py-10"><p className="text-xs uppercase tracking-[.2em] text-maroon-700">Owner workspace</p><h1 className="mt-2 font-serif text-4xl">Categories</h1><p className="mt-2 text-sm text-[var(--muted)]">Create and organize the categories customers use to browse the catalogue.</p><div className="mt-7"><CategoryManager initialCategories={categories} /></div></main>;
}
