"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ResilientImage } from "@/components/storefront/resilient-image";
import { LocalizedValue, useLocale } from "@/i18n/locale-provider";

type ProductImage = { id: string; url: string; alt: string; altHi: string | null; sortOrder: number };

export function ProductImageManager({ productId, initialImages }: { productId: string; initialImages: ProductImage[] }) {
  const { locale } = useLocale();
  const router = useRouter();
  const [images, setImages] = useState(initialImages);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [altHi, setAltHi] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Choose an image to upload.");
    setBusy(true); setError(null);
    const form = new FormData(); form.set("file", file); form.set("alt", alt); form.set("altHi", altHi);
    const response = await fetch(`/api/owner/products/${productId}/images`, { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Upload failed.");
    setImages((rows) => [...rows, data.image]); setFile(null); setAlt(""); setAltHi(""); router.refresh();
  }
  async function move(index: number, direction: -1 | 1) {
    const next = [...images]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true); setError(null);
    const response = await fetch(`/api/owner/products/${productId}/images`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageIds: next.map((item) => item.id) }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Image order could not be saved.");
    setImages(next); router.refresh();
  }
  async function remove(imageId: string) {
    setBusy(true); setError(null);
    const response = await fetch(`/api/owner/products/${productId}/images`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Image could not be removed.");
    setImages((rows) => rows.filter((item) => item.id !== imageId)); router.refresh();
  }

  return <section className="card-nrf mt-6 p-5"><h2 className="font-serif text-2xl">Product images</h2><p className="mt-2 text-sm text-[var(--muted)]">Upload JPEG, PNG, WebP or AVIF images up to 5 MB. Images are resized and converted to WebP before storage.</p>
    <form onSubmit={upload} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Image file<input className="input-nrf mt-1" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label className="text-sm">Alternative text (English)<input className="input-nrf mt-1" value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={180} required /></label><label className="text-sm">Alternative text (Hindi)<input className="input-nrf mt-1" value={altHi} onChange={(event) => setAltHi(event.target.value)} maxLength={180} /></label><button className="btn-secondary sm:col-span-2 sm:justify-self-start" disabled={busy || !file}>{busy ? "Saving…" : "Upload image"}</button></form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {images.length ? <ol className="mt-5 grid gap-3 sm:grid-cols-2">{images.map((image, index) => <li key={image.id} className="card-nrf flex gap-3 p-3"><div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900"><ResilientImage src={image.url} alt={locale === "hi" && image.altHi ? image.altHi : image.alt} fill sizes="96px" unoptimized className="object-cover" /></div><div className="min-w-0 flex-1"><p className="break-words text-sm"><LocalizedValue english={image.alt} hindi={image.altHi}/></p><p className="mt-1 text-xs text-[var(--muted)]">Position {index + 1}{index === 0 ? " · Main image" : ""}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy || index === 0} onClick={() => move(index, -1)}>Move up</button><button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy || index === images.length - 1} onClick={() => move(index, 1)}>Move down</button><button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => remove(image.id)}>Remove</button></div></div></li>)}</ol> : <p className="mt-5 rounded-xl bg-stone-50 p-4 text-sm text-[var(--muted)] dark:bg-stone-900">No product images yet.</p>}
  </section>;
}
