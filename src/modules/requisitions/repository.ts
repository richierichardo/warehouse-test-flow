import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hasPermission, requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import type { RequestDecision, RequestInput, RequestStatus } from "./schema";

const visibleRequestFields = {
  id: true, requestNo: true, itemId: true, requesterId: true, quantity: true, status: true, createdAt: true,
  item: { select: { id: true, code: true, name: true, unit: true } },
  requester: { select: { name: true } },
} as const satisfies Prisma.ItemRequestSelect;

const requestDetailFields = {
  ...visibleRequestFields, notes: true, decidedAt: true, rejectionReason: true,
  decidedBy: { select: { name: true } },
} as const satisfies Prisma.ItemRequestSelect;

export type RequestRecord = Prisma.ItemRequestGetPayload<{ select: typeof visibleRequestFields }>;
export type RequestDetailRecord = Prisma.ItemRequestGetPayload<{ select: typeof requestDetailFields }>;

function visibleRequestWhere(principal: Principal, filter: Prisma.ItemRequestWhereInput): Prisma.ItemRequestWhereInput {
  if (hasPermission(principal.role, "request:read-all")) return filter;
  requirePermission(principal.role, ["request:read-own"]);
  return { AND: [filter, { requesterId: principal.id }] };
}

export function listVisibleRequests(db: Prisma.TransactionClient, principal: Principal, filter: Prisma.ItemRequestWhereInput = {}, skip = 0, take = 20) {
  return db.itemRequest.findMany({
    where: visibleRequestWhere(principal, filter),
    select: visibleRequestFields,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
}

export function countVisibleRequests(db: Prisma.TransactionClient, principal: Principal, filter: Prisma.ItemRequestWhereInput) {
  return db.itemRequest.count({ where: visibleRequestWhere(principal, filter) });
}

export function findVisibleRequestById(db: Prisma.TransactionClient, principal: Principal, id: string) {
  return db.itemRequest.findFirst({ where: visibleRequestWhere(principal, { id }), select: requestDetailFields });
}

export function findRequestByKey(db: PrismaClient, requesterId: string, key: string) {
  return db.itemRequest.findUnique({
    where: { requesterId_idempotencyKey: { requesterId, idempotencyKey: key } },
    select: { ...requestDetailFields, payloadHash: true },
  });
}

export function insertRequest(db: PrismaClient, requesterId: string, requestNo: string, key: string, hash: string, input: RequestInput) {
  const { itemId, quantity, notes } = input;
  return db.itemRequest.create({ data: { requestNo, itemId, quantity, notes, requesterId, idempotencyKey: key, payloadHash: hash }, select: requestDetailFields });
}

export async function lockRequestForDecision(tx: Prisma.TransactionClient, id: string) {
  const [request] = await tx.$queryRaw<Array<{ itemId: string; quantity: number; status: RequestStatus; rejectionReason: string | null }>>`
    SELECT item_id AS "itemId", quantity, status::text AS status, rejection_reason AS "rejectionReason"
    FROM item_request WHERE id = ${id}::uuid FOR UPDATE
  `;
  return request ?? null;
}

export function storeDecision(tx: Prisma.TransactionClient, id: string, actorId: string, decidedAt: Date, decision: RequestDecision) {
  return tx.itemRequest.update({ where: { id }, data: {
    status: decision.status, decidedById: actorId, decidedAt,
    rejectionReason: decision.status === "REJECTED" ? decision.reason : null,
  }, select: requestDetailFields });
}
