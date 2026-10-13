"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string; slug: string; description: string | null; parentId: string | null; sortOrder: number; published: boolean; updatedAt?: Date | string };
type Draft = Omit<Category, "id" | "updatedAt">;
const blank: Draft = { name: "", slug: "", description: "", parentId: null, sortOrder: 0, published: false };

function CategoryForm({ category, categories, onSaved }: { category?: Category; categories: Category[]; onSaved: (category: Category) => void }) {
  const [draft, setDraft] = useState<Draft>(category ? { name: category.name, slug: category.slug, description: category.description ?? "", parentId: category.parentId, sortOrder: category.sortOrder, published: category.published } : blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(category ? `/api/owner/categories/${category.id}` : "/api/owner/categories", { method: category ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Category could not be saved.");
      onSaved(data.category); if (!category) setDraft(blank);
    } catch (e) { setError(e instanceof Error ? e.message : "Category could not be saved."); }
    finally { setBusy(false); }
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <form onSubmit={submit} className="grid gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-700 sm:grid-cols-2">
    <label className="grid gap-1 text-sm">Category name<input className="input-nrf" required minLength={2} maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
    <label className="grid gap-1 text-sm">URL slug<input className="input-nrf" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} /></label>
    <label className="grid gap-1 text-sm">Parent category<select className="input-nrf" value={draft.parentId ?? ""} onChange={(e) => set("parentId", e.target.value || null)}><option value="">Top-level category</option>{categories.filter((item) => item.id !== category?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm">Display order<input className="input-nrf" type="number" min="0" max="10000" value={draft.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Description<textarea className="input-nrf" rows={2} maxLength={1000} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.published} onChange={(e) => set("published", e.target.checked)} /> Published in navigation</label>
    <div className="flex items-center justify-between gap-3 sm:col-span-2">{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <span />}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : category ? "Save category" : "Add category"}</button></div>
  </form>;
}

export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const router = useRouter();
  function saved(category: Category) { setCategories((current) => current.some((item) => item.id === category.id) ? current.map((item) => item.id === category.id ? category : item) : [...current, category].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))); router.refresh(); }
  return <div className="grid gap-6">
    <section><h2 className="mb-3 font-serif text-xl">Add a category</h2><CategoryForm categories={categories} onSaved={saved} /></section>
    <section><h2 className="mb-3 font-serif text-xl">Existing categories</h2>{categories.length ? <div className="grid gap-3">{categories.map((category) => <details key={category.id} className="card-nrf p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span><span className="font-medium">{category.name}</span><span className="ml-2 text-sm text-[var(--muted)]">/{category.slug}</span></span><span className="text-xs text-[var(--muted)]">{category.published ? "Published" : "Hidden"}</span></summary><div className="mt-4"><CategoryForm key={`${category.id}-${category.updatedAt ?? category.slug}`} category={category} categories={categories} onSaved={saved} /></div></details>)}</div> : <p className="card-nrf p-6 text-sm text-[var(--muted)]">No categories have been created.</p>}</section>
  </div>;
}
