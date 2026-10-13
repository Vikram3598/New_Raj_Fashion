"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ShopFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  function update(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/shop?${next.toString()}`);
  }
  return (
    <form className="mt-6 grid gap-3 sm:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
      <input
        className="input-nrf"
        placeholder="Search"
        defaultValue={sp.get("q") ?? ""}
        onBlur={(e) => update("q", e.target.value)}
        aria-label="Filter by search"
      />
      <select className="input-nrf" defaultValue={sp.get("sort") ?? "newest"} onChange={(e) => update("sort", e.target.value)} aria-label="Sort">
        <option value="newest">Newest</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
      </select>
      <input className="input-nrf" placeholder="Colour" defaultValue={sp.get("colour") ?? ""} onBlur={(e) => update("colour", e.target.value)} aria-label="Colour" />
      <input className="input-nrf" placeholder="Size" defaultValue={sp.get("size") ?? ""} onBlur={(e) => update("size", e.target.value)} aria-label="Size" />
    </form>
  );
}
