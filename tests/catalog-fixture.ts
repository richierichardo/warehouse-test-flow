import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";

export async function receiveFixtureStock(db: PrismaClient, itemId: string, actorId: string, quantity: number) {
  const key = randomUUID();
  await db.$transaction(async (tx) => {
    const item = await tx.item.update({ where: { id: itemId }, data: { stock: { increment: quantity } }, select: { stock: true } });
    const receipt = await tx.goodsReceipt.create({ data: {
      receiptNo: `FIXTURE-${key}`, itemId, quantity, receivedOn: new Date(), sourceName: "Fixture katalog",
      receivedById: actorId, idempotencyKey: key, payloadHash: "fixture",
    } });
    await tx.stockMovement.create({ data: { itemId, actorId, quantity, direction: "IN", receiptId: receipt.id, balanceAfter: item.stock } });
  });
}

export function deleteCatalogFixtures(db: PrismaClient, createdById: string) {
  const item = { createdById };
  return db.$transaction([
    db.stockMovement.deleteMany({ where: { item } }),
    db.goodsReceipt.deleteMany({ where: { item } }),
    db.itemRequest.deleteMany({ where: { item } }),
    db.item.deleteMany({ where: item }),
  ]);
}
