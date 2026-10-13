"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ModerationReview = { id: string; rating: number; title: string | null; body: string; published: boolean; createdAt: string; productName: string; username: string };

export function ReviewModerator({ reviews }: { reviews: ModerationReview[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  async function setPublished(id: string, published: boolean) {
    setBusyId(id); setError("");
    try {
      const response = await fetch(`/api/owner/reviews/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ published }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Review could not be updated.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Review could not be updated."); }
    finally { setBusyId(""); }
  }
  return <div className="mt-6 grid gap-4">{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{reviews.map((review) => <article key={review.id} className="card-nrf p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{review.productName} · {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p><p className="mt-1 text-xs text-[var(--muted)]">{review.username} · {new Date(review.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p></div><span className="rounded-full bg-cream-100 px-3 py-1 text-xs dark:bg-stone-800">{review.published ? "Published" : "Pending"}</span></div>
    {review.title && <h2 className="mt-3 font-semibold">{review.title}</h2>}<p className="mt-2 whitespace-pre-line text-sm">{review.body}</p>
    <div className="mt-4 flex gap-2">{!review.published ? <button className="btn-primary" disabled={busyId === review.id} onClick={() => setPublished(review.id, true)}>Approve and publish</button> : <button className="btn-secondary" disabled={busyId === review.id} onClick={() => setPublished(review.id, false)}>Unpublish</button>}</div>
  </article>)}{!reviews.length && <p className="card-nrf p-6 text-sm text-[var(--muted)]">No submitted reviews.</p>}</div>;
}
