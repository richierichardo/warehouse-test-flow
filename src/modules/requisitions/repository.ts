import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hasPermission, requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";

const visibleRequestFields = {
  id: true, requestNo: true, itemId: true, requesterId: true, quantity: true, status: true, createdAt: true,
} as const;

function visibleRequestWhere(principal: Principal, filter: Prisma.ItemRequestWhereInput): Prisma.ItemRequestWhereInput {
  if (hasPermission(principal.role, "request:read-all")) return filter;
  requirePermission(principal.role, ["request:read-own"]);
  return { AND: [filter, { requesterId: principal.id }] };
}

export function listVisibleRequests(db: PrismaClient, principal: Principal, filter: Prisma.ItemRequestWhereInput = {}, skip = 0, take = 20) {
  return db.itemRequest.findMany({
    where: visibleRequestWhere(principal, filter),
    select: visibleRequestFields,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
}

export function findVisibleRequestById(db: PrismaClient, principal: Principal, id: string) {
  return db.itemRequest.findFirst({ where: visibleRequestWhere(principal, { id }), select: visibleRequestFields });
}
