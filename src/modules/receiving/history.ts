import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { dateOnly } from "@/lib/warehouse-date";
import { historyMeta, type HistoryQuery } from "@/modules/inventory/history-query";
import { receiptDto, receiptFields } from "./repository";

export async function listReceipts(db: PrismaClient, principal: Principal, query: HistoryQuery) {
  requirePermission(principal.role, ["receipt:read"]);
  const where: Prisma.GoodsReceiptWhereInput = {
    itemId: query.itemId,
    receivedOn: { gte: query.from ? dateOnly(query.from) : undefined, lte: query.to ? dateOnly(query.to) : undefined },
  };
  const [records, total] = await db.$transaction([
    db.goodsReceipt.findMany({ where, select: { ...receiptFields, movement: { select: { balanceAfter: true } } },
      orderBy: [{ postedAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
    db.goodsReceipt.count({ where }),
  ], { isolationLevel: "RepeatableRead" });
  return { data: records.map(receiptDto), meta: historyMeta(query, total) };
}
