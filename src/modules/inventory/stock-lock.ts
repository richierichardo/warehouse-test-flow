import "server-only";

import type { Prisma } from "../../generated/prisma/client.ts";

export async function lockItemStock(tx: Prisma.TransactionClient, itemId: string) {
  const [item] = await tx.$queryRaw<Array<{ stock: number }>>`
    SELECT stock FROM item WHERE id = ${itemId}::uuid FOR UPDATE
  `;
  return item ?? null;
}

export async function postingTime(tx: Prisma.TransactionClient) {
  const [{ postedAt }] = await tx.$queryRaw<Array<{ postedAt: Date }>>`SELECT clock_timestamp() AS "postedAt"`;
  return postedAt;
}
