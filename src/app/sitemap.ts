import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || "http://localhost:3000";
  const [products, categories, collections] = await Promise.all([
    prisma.product.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.collection.findMany({ where: { published: true }, select: { slug: true, createdAt: true } }),
  ]);
  return [
    { url: new URL("/", base).toString(), changeFrequency: "daily", priority: 1 },
    { url: new URL("/shop", base).toString(), changeFrequency: "daily", priority: 0.8 },
    ...categories.map((category) => ({ url: new URL(`/category/${category.slug}`, base).toString(), lastModified: category.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...collections.map((collection) => ({ url: new URL(`/collections/${collection.slug}`, base).toString(), lastModified: collection.createdAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((product) => ({ url: new URL(`/product/${product.slug}`, base).toString(), lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
