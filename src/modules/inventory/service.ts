import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { wibDayStart } from "@/lib/warehouse-date";
import { historyMeta, type HistoryQuery } from "./history-query";

export async function listIncomingMovements(db: PrismaClient, principal: Principal, query: HistoryQuery) {
  requirePermission(principal.role, ["movement:read"]);
  const toExclusive = query.to ? new Date(wibDayStart(query.to).getTime() + 86_400_000) : undefined;
  const where: Prisma.StockMovementWhereInput = {
    direction: "IN", itemId: query.itemId,
    postedAt: { gte: query.from ? wibDayStart(query.from) : undefined, lt: toExclusive },
  };
  const [records, total] = await db.$transaction([
    db.stockMovement.findMany({ where, orderBy: { id: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit,
      select: { id: true, direction: true, quantity: true, balanceAfter: true, postedAt: true,
        item: { select: { id: true, code: true, name: true, unit: true } },
        actor: { select: { name: true } }, receipt: { select: { receiptNo: true, receivedOn: true } },
      } }),
    db.stockMovement.count({ where }),
  ], { isolationLevel: "RepeatableRead" });

  const data = records.map(({ id, postedAt, receipt, ...record }) => ({
    ...record, id: id.toString(), postedAt: postedAt.toISOString(),
    receiptNo: receipt?.receiptNo ?? null, receivedOn: receipt?.receivedOn.toISOString().slice(0, 10) ?? null,
  }));
  return { data, meta: historyMeta(query, total) };
}
