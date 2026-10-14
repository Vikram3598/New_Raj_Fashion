"use client";

import { useState } from "react";
import { ResilientImage } from "@/components/storefront/resilient-image";
import { useLocale } from "@/i18n/locale-provider";

type GalleryImage = { id: string; url: string; alt: string; altHi?: string | null };

export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(false);
  const { locale } = useLocale();
  const current = images[selected];
  return <div className="grid gap-3">
    <button type="button" onClick={() => current && setZoom((value) => !value)} aria-label={zoom ? "Zoom out of product image" : "Zoom in on product image"} className={`relative aspect-[3/4] overflow-hidden rounded-3xl bg-gradient-to-br from-maroon-900 to-gold-700 ${current ? "cursor-zoom-in" : "cursor-default"}`}>
      {current && <ResilientImage src={current.url} alt={(locale === "hi" && current.altHi ? current.altHi : current.alt) || productName} fill priority sizes="(max-width: 1024px) 100vw, 50vw" unoptimized className={`object-cover transition-transform duration-300 ${zoom ? "scale-150 cursor-zoom-out" : "scale-100"}`} />}
    </button>
    {images.length > 1 && <div role="group" aria-label="Product image gallery" className="flex gap-2 overflow-x-auto pb-1">{images.map((image, index) => <button key={image.id} type="button" aria-label={`Show image ${index + 1}: ${locale === "hi" && image.altHi ? image.altHi : image.alt}`} aria-pressed={selected === index} onClick={() => { setSelected(index); setZoom(false); }} className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${selected === index ? "border-maroon-700" : "border-transparent"}`}><ResilientImage src={image.url} alt="" fill sizes="64px" unoptimized className="object-cover" /></button>)}</div>}
  </div>;
}
