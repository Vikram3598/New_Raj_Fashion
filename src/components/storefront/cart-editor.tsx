"use client";

import { paiseToInr } from "@/lib/money";
import { useRouter } from "next/navigation";

export function CartEditor({
  items,
}: {
  items: { id: string; name: string; title: string; quantity: number; pricePaise: number }[];
}) {
  const router = useRouter();
  async function update(itemId: string, quantity: number) {
    await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, quantity }),
    });
    router.refresh();
  }
  return (
    <ul className="mt-8 grid gap-4">
      {items.map((item) => (
        <li key={item.id} className="card-nrf flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-[var(--muted)]">{item.title}</p>
            <p className="text-sm">{paiseToInr(item.pricePaise)}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`qty-${item.id}`}>
              Quantity
            </label>
            <input
              id={`qty-${item.id}`}
              type="number"
              min={0}
              className="input-nrf w-20"
              defaultValue={item.quantity}
              onBlur={(e) => update(item.id, Number(e.target.value))}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
