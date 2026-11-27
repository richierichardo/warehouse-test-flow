import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { wibDayStart } from "@/lib/warehouse-date";
import { historyMeta, type MovementQuery } from "./history-query";

export async function listMovements(db: PrismaClient, principal: Principal, query: MovementQuery) {
  requirePermission(principal.role, ["movement:read"]);
  const toExclusive = query.to ? new Date(wibDayStart(query.to).getTime() + 86_400_000) : undefined;
  const where: Prisma.StockMovementWhereInput = {
    direction: query.direction, itemId: query.itemId,
    postedAt: { gte: query.from ? wibDayStart(query.from) : undefined, lt: toExclusive },
  };
  const [records, total] = await db.$transaction(async (tx) => {
    const records = await tx.stockMovement.findMany({ where, orderBy: { id: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit,
      select: { id: true, direction: true, quantity: true, balanceAfter: true, postedAt: true,
        item: { select: { id: true, code: true, name: true, unit: true } },
        actor: { select: { name: true } }, receipt: { select: { receiptNo: true, receivedOn: true } },
        request: { select: { requestNo: true } },
      } });
    const total = await tx.stockMovement.count({ where });
    return [records, total] as const;
  }, { isolationLevel: "RepeatableRead" });

  const data = records.map(({ id, postedAt, receipt, request, ...record }) => ({
    ...record, id: id.toString(), postedAt: postedAt.toISOString(),
    receiptNo: receipt?.receiptNo ?? null, receivedOn: receipt?.receivedOn.toISOString().slice(0, 10) ?? null,
    requestNo: request?.requestNo ?? null,
  }));
  return { data, meta: historyMeta(query, total) };
}
