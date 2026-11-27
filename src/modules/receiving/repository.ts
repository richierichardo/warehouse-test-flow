import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { dateOnly } from "../../lib/warehouse-date.ts";
import type { ReceiptInput } from "./schema.ts";

export const receiptFields = {
  id: true, receiptNo: true, quantity: true, receivedOn: true, postedAt: true,
  sourceName: true, deliveryNoteRef: true, notes: true,
  item: { select: { id: true, code: true, name: true, unit: true } },
  receivedBy: { select: { name: true } },
} as const satisfies Prisma.GoodsReceiptSelect;

type ReceiptRecord = Prisma.GoodsReceiptGetPayload<{ select: typeof receiptFields }>;
type RecordedReceipt = ReceiptRecord & { movement: { balanceAfter: number } | null };

export function receiptDto(record: RecordedReceipt) {
  const { movement, receivedOn, postedAt, ...receipt } = record;
  return { ...receipt, receivedOn: receivedOn.toISOString().slice(0, 10), postedAt: postedAt.toISOString(), balanceAfter: movement?.balanceAfter ?? null };
}

type ReceiptWrite = { actorId: string; key: string; hash: string; input: ReceiptInput };

export function findReceiptByKey(db: Prisma.TransactionClient, actorId: string, key: string) {
  return db.goodsReceipt.findUnique({
    where: { receivedById_idempotencyKey: { receivedById: actorId, idempotencyKey: key } },
    select: { ...receiptFields, payloadHash: true, movement: { select: { balanceAfter: true } } },
  });
}

export function postReceipt(db: PrismaClient, { actorId, key, hash, input }: ReceiptWrite) {
  return db.$transaction(async (tx) => {
    const previous = await findReceiptByKey(tx, actorId, key);
    if (previous) return { kind: "recorded", record: previous } as const;

    const [item] = await tx.$queryRaw<Array<{ stock: number }>>`
      SELECT stock FROM item WHERE id = ${input.itemId}::uuid FOR UPDATE
    `;
    // A request for this item may have committed while this transaction was waiting for the lock.
    const committed = await findReceiptByKey(tx, actorId, key);
    if (committed) return { kind: "recorded", record: committed } as const;
    if (!item) return { kind: "missing" } as const;

    const balanceAfter = item.stock + input.quantity;
    if (balanceAfter > 2_000_000_000) return { kind: "stock-limit" } as const;

    const [{ postedAt }] = await tx.$queryRaw<Array<{ postedAt: Date }>>`SELECT clock_timestamp() AS "postedAt"`;
    const { itemId, quantity, receivedOn, sourceName, deliveryNoteRef, notes } = input;
    const record = await tx.goodsReceipt.create({ data: {
      receiptNo: `RCV-${randomUUID().toUpperCase()}`, itemId, quantity, receivedOn: dateOnly(receivedOn),
      sourceName, deliveryNoteRef, notes, receivedById: actorId, idempotencyKey: key, payloadHash: hash, postedAt,
    }, select: receiptFields });
    await tx.item.update({ where: { id: itemId }, data: { stock: balanceAfter } });
    await tx.stockMovement.create({ data: {
      itemId, quantity, direction: "IN", receiptId: record.id, actorId, balanceAfter, postedAt,
    } });
    return { kind: "created", record: { ...record, movement: { balanceAfter } } } as const;
  }, { isolationLevel: "ReadCommitted" });
}
