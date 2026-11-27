import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { hasPermission, requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { countVisibleRequests, findRequestByKey, findVisibleRequestById, insertRequest, listVisibleRequests,
  type RequestDetailRecord, type RequestRecord } from "./repository";
import type { RequestInput, RequestQuery } from "./schema";

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

export async function getRequest(db: PrismaClient, principal: Principal, id: string) {
  const record = await findVisibleRequestById(db, principal, id);
  return record && detailDto(record, principal);
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
