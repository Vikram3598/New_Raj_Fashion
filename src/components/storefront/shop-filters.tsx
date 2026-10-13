"use client";

import { useRouter } from "next/navigation";

export function ShopFilters({ basePath = "/shop", query = "", sort = "newest", colour = "", size = "" }: { basePath?: string; query?: string; sort?: string; colour?: string; size?: string }) {
  const router = useRouter();
  function update(key: string, value: string) {
    const next = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`${basePath}?${next.toString()}`);
  }
  return (
    <form className="mt-6 grid gap-3 sm:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
      <input
        className="input-nrf"
        placeholder="Search"
        defaultValue={query}
        onBlur={(e) => update("q", e.target.value)}
        aria-label="Filter by search"
      />
      <select className="input-nrf" defaultValue={sort} onChange={(e) => update("sort", e.target.value)} aria-label="Sort">
        <option value="newest">Newest</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
      </select>
      <input className="input-nrf" placeholder="Colour" defaultValue={colour} onBlur={(e) => update("colour", e.target.value)} aria-label="Colour" />
      <input className="input-nrf" placeholder="Size" defaultValue={size} onBlur={(e) => update("size", e.target.value)} aria-label="Size" />
    </form>
  );
}
