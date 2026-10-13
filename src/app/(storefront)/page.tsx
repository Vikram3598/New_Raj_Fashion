export const dynamic = "force-dynamic";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { getBanners, getNavCategories, getStoreSettings } from "@/lib/store";
import { ProductCard } from "@/components/storefront/product-card";
import { NewsletterForm } from "@/components/storefront/newsletter-form";
import { getSessionUser } from "@/lib/auth/session";

export default async function HomePage() {
  const [settings, categories, banners, sections, faqs, user] = await Promise.all([
    getStoreSettings(),
    getNavCategories(),
    getBanners(),
    prisma.homeSection.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
    prisma.faqItem.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } }),
    getSessionUser(),
  ]);

  const published = { status: "PUBLISHED" as const };
  const products = await prisma.product.findMany({
    where: published,
    include: { images: { orderBy: { sortOrder: "asc" } }, variants: true, category: true },
    orderBy: { createdAt: "desc" },
    take: 48,
  });

  const hero = banners.filter((b) => b.slot === "hero");
  const promo = banners.filter((b) => b.slot !== "hero");

  const byCat = (slugPart: string) =>
    products.filter((p) => p.category?.slug.includes(slugPart) || p.tags.some((t) => t.includes(slugPart))).slice(0, 8);

  let recent: typeof products = [];
  if (user) {
    const rv = await prisma.recentlyViewed.findMany({
      where: { userId: user.id },
      include: { product: { include: { images: true, variants: true, category: true } } },
      orderBy: { viewedAt: "desc" },
      take: 8,
    });
    recent = rv.map((r) => r.product);
  }

  const genuineReviews = await prisma.productReview.findMany({
    where: { published: true },
    include: { product: true },
    take: 6,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <section className="relative overflow-hidden bg-maroon-900 text-cream-100">
        {hero[0]?.imageUrl ? <div className="absolute inset-0"><Image src={hero[0].imageUrl} alt="" fill priority sizes="100vw" unoptimized className="object-cover" /><div className="absolute inset-0 bg-maroon-900/75" /></div> : null}
        <div className="container-nrf relative z-10 grid gap-8 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-gold-400">Gandhi Chowk, Sidhi</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-6xl">
              {hero[0]?.title ?? "New Raj Fashion and Raj Saree Showroom"}
            </h1>
            <p className="mt-4 max-w-xl text-cream-200">
              {hero[0]?.subtitle ??
                "Everyday clothing, festive ethnic wear, sarees, suiting and shirting, and wedding collections for the family."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={hero[0]?.href ?? "/shop"} className="btn-primary bg-gold-500 text-maroon-900 hover:bg-gold-400">
                Shop the collection
              </Link>
              <Link href="/collections/wedding" className="btn-secondary border-gold-400 bg-transparent text-cream-100">
                Wedding collection
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {["Sarees", "Wedding", "Men", "Kids"].map((label) => (
              <div key={label} className="aspect-[4/5] rounded-3xl bg-gradient-to-br from-gold-700/40 to-maroon-700 p-4">
                <p className="font-serif text-2xl">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {promo.length > 0 ? (
        <section className="container-nrf grid gap-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {promo.map((b) => (
            <Link key={b.id} href={b.href ?? "/shop"} className="card-nrf overflow-hidden bg-cream-100 dark:bg-stone-900">
              {b.imageUrl ? <div className="relative aspect-[16/9]"><Image src={b.imageUrl} alt="" fill sizes="(max-width: 768px) 50vw, 25vw" unoptimized className="object-cover" /></div> : null}
              <div className="p-5">
              <p className="text-xs uppercase tracking-widest text-gold-700">{b.slot}</p>
              <h2 className="mt-2 font-serif text-2xl">{b.title}</h2>
              {b.subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{b.subtitle}</p> : null}
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="container-nrf py-8">
        <h2 className="font-serif text-3xl">Shop by category</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {categories.map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="card-nrf p-5">
              <p className="font-serif text-xl">{c.name}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{c.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {sections.map((section) => {
        const list =
          section.key === "new-arrivals"
            ? products.slice(0, 8)
            : section.key === "sarees"
              ? byCat("saree")
              : section.key === "mens-formal"
                ? byCat("mens")
                : section.key === "womens-ethnic"
                  ? byCat("womens")
                  : section.key === "kids"
                    ? byCat("kids")
                    : section.key === "suiting"
                      ? byCat("suiting")
                      : section.key === "wedding"
                        ? byCat("wedding")
                        : products.slice(0, 8);
        if (list.length === 0) return null;
        return (
          <section key={section.id} className="container-nrf py-8">
            <div className="flex items-end justify-between">
              <h2 className="font-serif text-3xl">{section.title}</h2>
              <Link href="/shop" className="text-sm text-maroon-700">
                View all
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        );
      })}

      {recent.length > 0 ? (
        <section className="container-nrf py-8">
          <h2 className="font-serif text-3xl">Recently viewed</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {recent.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}

      {genuineReviews.length > 0 ? (
        <section className="container-nrf py-8">
          <h2 className="font-serif text-3xl">Customer reviews</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {genuineReviews.map((r) => (
              <article key={r.id} className="card-nrf p-5">
                <p className="font-medium">{r.title ?? r.product.name}</p>
                <p className="mt-2 text-sm">{r.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="container-nrf grid gap-8 py-12 lg:grid-cols-2">
        <div className="card-nrf p-6">
          <h2 className="font-serif text-3xl">About the store</h2>
          <p className="mt-4 text-[var(--muted)]">
            {settings?.aboutHtml ??
              "New Raj Fashion and Raj Saree Showroom is a local fashion destination in Gandhi Chowk, Sidhi, Madhya Pradesh, serving customers looking for everyday clothing, traditional Indian wear, sarees, suiting and shirting, and wedding collections."}
          </p>
          <Link href="/about" className="mt-4 inline-block text-sm text-maroon-700">
            Read more
          </Link>
        </div>
        <div className="card-nrf p-6">
          <h2 className="font-serif text-3xl">Visit us</h2>
          <p className="mt-4">
            {settings?.address}
            <br />
            {settings?.city}, {settings?.state} {settings?.postalCode}
          </p>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Opening hours, GSTIN, and contact numbers are shown only after the owner configures them.
          </p>
        </div>
      </section>

      <section className="container-nrf py-8">
        <h2 className="font-serif text-3xl">Frequently asked questions</h2>
        <div className="mt-6 grid gap-3">
          {faqs.map((f) => (
            <details key={f.id} className="card-nrf p-4">
              <summary className="cursor-pointer font-medium">{f.question}</summary>
              <p className="mt-2 text-sm text-[var(--muted)]">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container-nrf py-10">
        <div className="card-nrf bg-maroon-700 p-8 text-cream-100">
          <h2 className="font-serif text-3xl">Offers and updates</h2>
          <p className="mt-2 text-sm text-cream-200">Subscribe only if you want promotional messages. You can unsubscribe later.</p>
          <NewsletterForm />
        </div>
      </section>
    </div>
  );
}


