import { setTimeout as delay } from "node:timers/promises";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";

export async function holdLock(db: PrismaClient, lock: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const blocker = db.$transaction(async (tx) => {
    await lock(tx);
    held.resolve();
    await release.promise;
  }, { timeout: 12_000 });
  void blocker.catch(held.reject);
  await held.promise;
  return async () => { release.resolve(); await blocker; };
}

export async function blockedQueries(db: PrismaClient, pattern: string, count: number) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [row] = await db.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database() AND query LIKE ${pattern} AND cardinality(pg_blocking_pids(pid)) > 0
    `;
    if (row.count >= count) return true;
    await delay(65);
  }
  return false;
}
