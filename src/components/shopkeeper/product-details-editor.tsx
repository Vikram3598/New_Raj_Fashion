"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };
type Product = {
  id: string; name: string; nameHi: string | null; slug: string; categoryId: string | null;
  brand: string | null; fabric: string | null; material: string | null; gender: string | null;
  occasion: string | null; tags: string[]; description: string; descriptionHi: string | null;
  careInstructions: string | null;
};

export function ProductDetailsEditor({ product, categories }: { product: Product; categories: Category[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(form: FormData) {
    setBusy(true); setMessage("");
    const nullable = (key: string) => String(form.get(key) ?? "").trim() || null;
    const body = {
      name: String(form.get("name") ?? ""), nameHi: nullable("nameHi"),
      slug: String(form.get("slug") ?? "").toLowerCase(),
      description: String(form.get("description") ?? ""), descriptionHi: nullable("descriptionHi"),
      categoryId: nullable("categoryId"), brand: nullable("brand"), fabric: nullable("fabric"), material: nullable("material"),
      gender: nullable("gender"), occasion: nullable("occasion"), careInstructions: nullable("careInstructions"),
      tags: String(form.get("tags") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    };
    try {
      const response = await fetch(`/api/owner/products/${product.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save product.");
      setMessage("Product details saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save product."); }
    finally { setBusy(false); }
  }

  return <form action={save} className="card-nrf mt-6 grid gap-4 p-5 sm:grid-cols-2">
    <h2 className="font-serif text-2xl sm:col-span-2">Catalogue details</h2>
    <label className="grid gap-1 text-sm">Name (English)<input name="name" required defaultValue={product.name} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Name (Hindi)<input name="nameHi" lang="hi" defaultValue={product.nameHi ?? ""} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={product.slug} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Category<select name="categoryId" defaultValue={product.categoryId ?? ""} className="input-nrf"><option value="">Unassigned</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm">Brand<input name="brand" defaultValue={product.brand ?? ""} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Fabric<input name="fabric" defaultValue={product.fabric ?? ""} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Material<input name="material" defaultValue={product.material ?? ""} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Audience<input name="gender" defaultValue={product.gender ?? ""} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Occasion<input name="occasion" defaultValue={product.occasion ?? ""} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm">Tags<input name="tags" defaultValue={product.tags.join(", ")} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Description (English)<textarea name="description" required rows={4} defaultValue={product.description} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Description (Hindi)<textarea name="descriptionHi" lang="hi" rows={4} defaultValue={product.descriptionHi ?? ""} className="input-nrf" /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Care instructions<input name="careInstructions" defaultValue={product.careInstructions ?? ""} className="input-nrf" /></label>
    <div className="flex items-center gap-3 sm:col-span-2"><button disabled={busy} className="btn-secondary">{busy ? "Saving…" : "Save details"}</button>{message && <span aria-live="polite" className="text-xs text-[var(--muted)]">{message}</span>}</div>
  </form>;
}
