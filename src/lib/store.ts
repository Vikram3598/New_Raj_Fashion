import { prisma } from "@/lib/db";
import { cache } from "react";

export const getStoreSettings = cache(async () => {
  return prisma.storeSettings.findUnique({ where: { id: "store" } });
});

export const getNavCategories = cache(async () => {
  return prisma.category.findMany({
    where: { published: true, parentId: null },
    orderBy: { sortOrder: "asc" },
    include: { children: { where: { published: true }, orderBy: { sortOrder: "asc" } } },
  });
});

export const getBanners = cache(async (slot?: string) => {
  return prisma.promotionBanner.findMany({
    where: {
      enabled: true,
      ...(slot ? { slot } : {}),
      OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
    },
    orderBy: { sortOrder: "asc" },
  });
});
