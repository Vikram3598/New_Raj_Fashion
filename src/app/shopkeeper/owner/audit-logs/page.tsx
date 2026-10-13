import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const metadata = { title: "Audit log · Owner" };

export default async function OwnerAuditLogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner/audit-logs"); }
  const { page: raw } = await searchParams;
  const pageSize = 50;
  const requested = Math.max(1, Number.parseInt(raw ?? "1", 10) || 1);
  const total = await prisma.auditLog.count();
  const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { actor: { select: { username: true } } } });
  return <main className="container-nrf py-10"><h1 className="font-serif text-4xl">Administrative audit log</h1><p className="mt-2 text-sm text-[var(--muted)]">Sensitive management actions recorded by the application.</p>
    {entries.length ? <div className="mt-6 grid gap-3">{entries.map((entry) => <article key={entry.id} className="card-nrf p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{entry.action}</p><time className="text-xs text-[var(--muted)]">{entry.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</time></div><p className="mt-1 text-sm">{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""} · by {entry.actor?.username ?? "system"}</p>{entry.metadata ? <pre className="mt-2 overflow-x-auto rounded-lg bg-cream-50 p-2 text-xs dark:bg-stone-950">{JSON.stringify(entry.metadata, null, 2)}</pre> : null}</article>)}</div> : <p className="card-nrf mt-6 p-6 text-sm text-[var(--muted)]">Audit activity will appear here as privileged actions occur.</p>}
    {total > pageSize ? <nav className="mt-5 flex justify-between text-sm"><span>Page {page} of {Math.ceil(total / pageSize)}</span><div className="flex gap-4">{page > 1 ? <Link className="text-maroon-700" href={`?page=${page - 1}`}>Previous</Link> : null}{page * pageSize < total ? <Link className="text-maroon-700" href={`?page=${page + 1}`}>Next</Link> : null}</div></nav> : null}
  </main>;
}
