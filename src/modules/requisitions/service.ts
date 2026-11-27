import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { hasPermission, requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { lockItemStock, postingTime } from "@/modules/inventory/stock-lock";
import { countVisibleRequests, findRequestByKey, findVisibleRequestById, insertRequest, listVisibleRequests, lockRequestForDecision, storeDecision,
  type RequestDetailRecord, type RequestRecord } from "./repository";
import type { RequestDecision, RequestInput, RequestQuery } from "./schema";

function summaryDto(record: RequestRecord, principal: Principal) {
  const { id, requestNo, item, quantity, status, createdAt, requester } = record;
  const publicFields = { id, requestNo, item, quantity, status, createdAt: createdAt.toISOString() };
  return hasPermission(principal.role, "request:read-all") ? { ...publicFields, requester } : { ...publicFields, requester: undefined };
}

function detailDto(record: RequestDetailRecord, principal: Principal) {
  return { ...summaryDto(record, principal), notes: record.notes, decidedAt: record.decidedAt?.toISOString() ?? null,
    decidedBy: record.decidedBy, rejectionReason: record.rejectionReason };
}

export async function listRequests(db: PrismaClient, principal: Principal, { status, page, limit }: RequestQuery) {
  const filter = status ? { status } : {};
  const [rows, total] = await db.$transaction(async (tx) => {
    const records = await listVisibleRequests(tx, principal, filter, (page - 1) * limit, limit);
    const count = await countVisibleRequests(tx, principal, filter);
    return [records, count] as const;
  }, { isolationLevel: "RepeatableRead" });
  return { data: rows.map((row) => summaryDto(row, principal)), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getRequest(db: Prisma.TransactionClient, principal: Principal, id: string) {
  const record = await findVisibleRequestById(db, principal, id);
  return record && detailDto(record, principal);
}

async function applyStockOut(tx: Prisma.TransactionClient, requestId: string, actorId: string, itemId: string, quantity: number) {
  const item = await lockItemStock(tx, itemId);
  if (!item) throw new Error("Permintaan merujuk barang yang tidak tersedia.");
  if (item.stock < quantity) throw new HttpError(409, "INSUFFICIENT_STOCK", "Stok saat ini tidak cukup untuk menyetujui permintaan.");

  const balanceAfter = item.stock - quantity;
  const postedAt = await postingTime(tx);
  await tx.item.update({ where: { id: itemId }, data: { stock: balanceAfter }, select: { id: true } });
  await tx.stockMovement.create({ data: { itemId, requestId, actorId, direction: "OUT", quantity, balanceAfter, postedAt }, select: { id: true } });
  return postedAt;
}

export function decideRequest(db: PrismaClient, principal: Principal, id: string, decision: RequestDecision) {
  requirePermission(principal.role, ["request:decide"]);
  return db.$transaction(async (tx) => {
    const request = await lockRequestForDecision(tx, id);
    if (!request) throw new HttpError(404, "REQUEST_NOT_FOUND", "Permintaan tidak ditemukan.");

    if (request.status !== "PENDING") {
      const sameReason = decision.status === "APPROVED" || decision.reason === request.rejectionReason;
      if (request.status !== decision.status || !sameReason) {
        throw new HttpError(409, "ALREADY_DECIDED", "Permintaan ini sudah diputuskan.");
      }
      const recorded = await getRequest(tx, principal, id);
      if (!recorded) throw new Error("Keputusan yang terkunci tidak dapat dibaca.");
      return recorded;
    }

    const decidedAt = decision.status === "APPROVED"
      ? await applyStockOut(tx, id, principal.id, request.itemId, request.quantity)
      : await postingTime(tx);
    return detailDto(await storeDecision(tx, id, principal.id, decidedAt, decision), principal);
  }, { isolationLevel: "ReadCommitted" });
}

export async function submitRequest(db: PrismaClient, principal: Principal, key: string, input: RequestInput) {
  requirePermission(principal.role, ["request:create"]);
  const { itemId, quantity, notes } = input;
  const hash = createHash("sha256").update(JSON.stringify([itemId, quantity, notes])).digest("hex");

  function replay(record: RequestDetailRecord & { payloadHash: string }) {
    if (record.payloadHash !== hash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Kunci pengiriman sudah dipakai untuk permintaan yang berbeda.");
    return { data: detailDto(record, principal), status: 200 as const };
  }

  const previous = await findRequestByKey(db, principal.id, key);
  if (previous) return replay(previous);

  try {
    const record = await insertRequest(db, principal.id, `REQ-${randomUUID().toUpperCase()}`, key, hash, input);
    return { data: detailDto(record, principal), status: 201 as const };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The duplicate insert has rolled back. Read the winning row outside that transaction.
      const committed = await findRequestByKey(db, principal.id, key);
      if (committed) return replay(committed);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      const item = await db.item.findUnique({ where: { id: itemId }, select: { id: true } });
      if (!item) throw new HttpError(404, "ITEM_NOT_FOUND", "Barang tidak ditemukan.");
    }
    throw error;
  }
}
