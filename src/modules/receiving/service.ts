import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { HttpError } from "../../lib/http.ts";
import { requirePermission } from "../../lib/permissions.ts";
import type { Principal } from "../../lib/principal.ts";
import { findReceiptByKey, postReceipt, receiptDto } from "./repository.ts";
import type { ReceiptInput } from "./schema.ts";

export async function receiveGoods(db: PrismaClient, principal: Pick<Principal, "id" | "role">, key: string, input: ReceiptInput) {
  requirePermission(principal.role, ["receipt:create"]);
  const { itemId, quantity, receivedOn, sourceName, deliveryNoteRef, notes } = input;
  const hash = createHash("sha256").update(JSON.stringify([itemId, quantity, receivedOn, sourceName, deliveryNoteRef, notes])).digest("hex");

  const result = await postReceipt(db, { actorId: principal.id, key, hash, input }).catch(async (error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The failed transaction has rolled back. The competing receipt is visible from this connection.
      const record = await findReceiptByKey(db, principal.id, key);
      if (record) return { kind: "recorded", record } as const;
    }
    throw error;
  });

  if (result.kind === "missing") throw new HttpError(404, "ITEM_NOT_FOUND", "Barang tidak ditemukan.");
  if (result.kind === "stock-limit") throw new HttpError(409, "STOCK_LIMIT_EXCEEDED", "Penerimaan ini melebihi batas saldo barang.");
  if (result.kind === "created") return { data: receiptDto(result.record), status: 201 as const };
  const { payloadHash, ...record } = result.record;
  if (payloadHash !== hash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Kunci pengiriman sudah dipakai untuk penerimaan yang berbeda.");
  return { data: receiptDto(record), status: 200 as const };
}
