import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function reserveStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
  reference: string,
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "ProductVariant"
    SET "stockReserved" = "stockReserved" + ${quantity}, "updatedAt" = NOW()
    WHERE id = ${variantId}
      AND "isActive" = true
      AND ("stockOnHand" - "stockReserved") >= ${quantity}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error("One or more items are no longer available in the requested quantity.");
  }
  await tx.inventoryMovement.create({
    data: {
      variantId,
      deltaOnHand: 0,
      deltaReserved: quantity,
      reason: "reserve",
      reference,
    },
  });
}

export async function releaseReservation(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
  reference: string,
) {
  await tx.$executeRaw`
    UPDATE "ProductVariant"
    SET "stockReserved" = GREATEST("stockReserved" - ${quantity}, 0), "updatedAt" = NOW()
    WHERE id = ${variantId}
  `;
  await tx.inventoryMovement.create({
    data: {
      variantId,
      deltaOnHand: 0,
      deltaReserved: -quantity,
      reason: "release",
      reference,
    },
  });
}

export async function commitReservation(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
  reference: string,
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "ProductVariant"
    SET "stockOnHand" = "stockOnHand" - ${quantity},
        "stockReserved" = GREATEST("stockReserved" - ${quantity}, 0),
        "updatedAt" = NOW()
    WHERE id = ${variantId}
      AND "stockOnHand" >= ${quantity}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error("Unable to commit inventory for this order.");
  }
  await tx.inventoryMovement.create({
    data: {
      variantId,
      deltaOnHand: -quantity,
      deltaReserved: -quantity,
      reason: "sale",
      reference,
    },
  });
}

export async function availableStock(variantId: string) {
  const v = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!v) return 0;
  return Math.max(0, v.stockOnHand - v.stockReserved);
}
