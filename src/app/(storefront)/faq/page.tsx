export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";

export const metadata = { title: "Frequently asked questions" };

export default async function FaqPage() {
  const items = await prisma.faqItem.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
  return <div className="container-nrf py-12"><h1 className="font-serif text-4xl">Frequently asked questions</h1>{items.length ? <div className="mt-7 grid max-w-3xl gap-3">{items.map((item) => <details key={item.id} className="card-nrf p-4"><summary className="cursor-pointer font-medium">{item.question}</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{item.answer}</p></details>)}</div> : <p className="mt-4 max-w-2xl text-sm text-[var(--muted)]">Answers will appear here when the showroom has configured its customer support information.</p>}</div>;
}
