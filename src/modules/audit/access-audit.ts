import "server-only";

import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { accountRoleSchema, type AccountAccess, type AdminQuery } from "@/modules/identity-access/admin-schema";

const actions = ["ACCESS_UPDATED", "SESSIONS_REVOKED"] as const;
type SessionCount = { sessionCount: number };
type Event = { actorId: string; targetId: string; correlationId: string } & (
  | { action: "ACCESS_UPDATED"; before: AccountAccess; after: AccountAccess }
  | { action: "SESSIONS_REVOKED"; before: SessionCount; after: SessionCount }
);

const accessSnapshot = z.object({ role: accountRoleSchema, isActive: z.boolean() });
const sessionSnapshot = z.object({ sessionCount: z.number().int().nonnegative() });

export async function appendAccessAudit(tx: Prisma.TransactionClient, event: Event) {
  await tx.accessAudit.create({ data: { actorId: event.actorId, targetId: event.targetId, action: event.action,
    beforeSafe: event.before, afterSafe: event.after, correlationId: event.correlationId }, select: { id: true } });
}

export async function listAccessAudit(db: PrismaClient, principal: Principal, { page, limit }: AdminQuery) {
  requirePermission(principal.role, ["user:read"]);
  const where = { action: { in: [...actions] } };
  const { rows, total } = await db.$transaction(async (tx) => {
    const rows = await tx.accessAudit.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, action: true, beforeSafe: true, afterSafe: true, createdAt: true, correlationId: true,
        actor: { select: { name: true } }, target: { select: { name: true } } } });
    return { rows, total: await tx.accessAudit.count({ where }) };
  }, { isolationLevel: "RepeatableRead" });

  const data = rows.map(({ beforeSafe, afterSafe, createdAt, ...row }) => {
    const schema = row.action === "ACCESS_UPDATED" ? accessSnapshot : sessionSnapshot;
    return { ...row, createdAt: createdAt.toISOString(), before: schema.safeParse(beforeSafe).data, after: schema.safeParse(afterSafe).data };
  });
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
