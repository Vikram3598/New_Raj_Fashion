"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Suggestion = { slug: string; name: string };

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
      if (res.ok) setItems(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <input
        id="site-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search sarees, kurtas, shirts..."
        className="input-nrf"
        autoComplete="off"
      />
      {items.length > 0 ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {items.map((item) => (
            <li key={item.slug}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-cream-100 dark:hover:bg-stone-800"
                onClick={() => router.push(`/product/${item.slug}`)}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
