"use client";

import { useState } from "react";
import { paiseToInr } from "@/lib/money";

type Variant = {
  id: string;
  title: string;
  size: string | null;
  colour: string | null;
  pricePaise: number;
  available: number;
};

export function AddToCart({ variants }: { productId: string; variants: Variant[] }) {
  const firstBuyable = variants.find((v) => v.available > 0) ?? variants[0];
  const [variantId, setVariantId] = useState(firstBuyable?.id ?? "");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const selected = variants.find((v) => v.id === variantId);
  const canBuy = Boolean(selected && selected.available > 0);

  async function post(path: string) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, quantity: qty }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Added." : data.error ?? "Unable to add this item.");
  }

  return (
    <div className="mt-6 grid gap-4">
      <label className="text-sm">
        Variant
        <select className="input-nrf mt-1" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
          {variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.available <= 0}>
              {v.title} — {paiseToInr(v.pricePaise)} {v.available <= 0 ? "(unavailable)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Quantity
        <input
          type="number"
          min={1}
          max={selected?.available ?? 1}
          className="input-nrf mt-1"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          disabled={!canBuy}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={!canBuy} onClick={() => post("/api/cart")}>
          Add to cart
        </button>
        <button type="button" className="btn-secondary" onClick={() => post("/api/wishlist")}>
          Wishlist
        </button>
      </div>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  );
}
