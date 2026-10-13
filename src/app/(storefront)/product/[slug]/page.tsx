import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { paiseToInr } from "@/lib/money";
import { AddToCart } from "@/components/storefront/add-to-cart";
import { getSessionUser } from "@/lib/auth/session";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) return { title: "Product" };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    alternates: { canonical: `/product/${product.slug}` },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { where: { isActive: true } },
      category: true,
      reviews: { where: { published: true } },
    },
  });
  if (!product || product.status !== "PUBLISHED") notFound();

  const user = await getSessionUser();
  if (user) {
    await prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId: user.id, productId: product.id } },
      update: { viewedAt: new Date() },
      create: { userId: user.id, productId: product.id },
    });
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      priceCurrency: "INR",
      price: (v.pricePaise / 100).toFixed(2),
      availability: v.stockOnHand - v.stockReserved > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    })),
  };

  return (
    <div className="container-nrf grid gap-10 py-10 lg:grid-cols-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="grid gap-3">
        <div className="aspect-[3/4] overflow-hidden rounded-3xl bg-gradient-to-br from-maroon-900 to-gold-700">
          {product.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.images[0].url} alt={product.images[0].alt} className="h-full w-full object-cover" />
          ) : null}
        </div>
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">{product.category?.name}</p>
        <h1 className="mt-1 font-serif text-4xl">{product.name}</h1>
        <p className="mt-3 text-lg">{paiseToInr(Math.min(...product.variants.map((v) => v.pricePaise)))}</p>
        <p className="mt-4 whitespace-pre-line text-sm leading-6">{product.description}</p>
        {product.fabric ? <p className="mt-3 text-sm">Fabric: {product.fabric}</p> : null}
        {product.careInstructions ? <p className="mt-2 text-sm">Care: {product.careInstructions}</p> : null}
        <AddToCart
          productId={product.id}
          variants={product.variants.map((v) => ({
            id: v.id,
            title: v.title,
            size: v.size,
            colour: v.colour,
            pricePaise: v.pricePaise,
            available: v.stockOnHand - v.stockReserved,
          }))}
        />
        {product.reviews.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-serif text-2xl">Reviews</h2>
            <ul className="mt-4 grid gap-3">
              {product.reviews.map((r) => (
                <li key={r.id} className="card-nrf p-4 text-sm">
                  <p className="font-medium">{r.title}</p>
                  <p>{r.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
