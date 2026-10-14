import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({ where: { sku: { startsWith: "DEMO-" } }, select: { id: true, sku: true, variants: { select: { id: true, movements: { select: { id: true, reason: true } }, _count: { select: { orderItems: true, cartItems: true, wishlistItems: true } } } } } });
  const retained: string[] = [];
  for (const product of products) {
    const referenced = product.variants.some((variant) => Object.values(variant._count).some((count) => count > 0) || variant.movements.some((movement) => movement.reason !== "demo_initial_stock"));
    if (referenced) {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id: product.id }, data: { status: "ARCHIVED" } });
        // Keep the stock balance aligned with its inventory ledger and historical order records.
        await tx.productVariant.updateMany({ where: { productId: product.id }, data: { isActive: false } });
      });
      retained.push(product.sku);
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryMovement.deleteMany({ where: { variantId: { in: product.variants.map((variant) => variant.id) }, reason: "demo_initial_stock" } });
        await tx.productVariant.deleteMany({ where: { productId: product.id } });
        await tx.product.delete({ where: { id: product.id } });
      });
    }
  }
  const banners = await prisma.promotionBanner.deleteMany({ where: { title: { startsWith: "[DEMO]" } } });
  console.info(`Removed ${products.length - retained.length} unused demo products and ${banners.count} demo banners.`);
  if (retained.length) console.info(`Archived referenced products and disabled their variants to preserve order/cart/history records: ${retained.join(", ")}`);
}

main().catch((error) => { console.error("Demo catalogue cleanup failed.", error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
