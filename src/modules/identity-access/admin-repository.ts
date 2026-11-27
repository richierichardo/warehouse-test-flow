import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AccountAccess, AdminQuery } from "./admin-schema";

const accountFields = { id: true, name: true, email: true, role: true, is_active: true } as const;
export type AccountRecord = Prisma.UserGetPayload<{ select: typeof accountFields }>;

export async function readAccounts(tx: Prisma.TransactionClient, { page, limit }: AdminQuery) {
  const rows = await tx.user.findMany({ select: accountFields, orderBy: [{ email: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit });
  return { rows, total: await tx.user.count() };
}

export async function lockAccessAdministration(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(90409, 1)`;
}

export function readAccount(tx: Prisma.TransactionClient, id: string) {
  return tx.user.findUnique({ where: { id }, select: accountFields });
}

export async function lockTargetAccount(tx: Prisma.TransactionClient, id: string) {
  // The row lock also orders concurrent session inserts through their User FK.
  const [target] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "user" WHERE id = ${id} FOR UPDATE`;
  return target ? readAccount(tx, target.id) : null;
}

export function countActiveSuperadmins(tx: Prisma.TransactionClient) {
  return tx.user.count({ where: { role: "SUPERADMIN", is_active: true } });
}

export function updateAccountAccess(tx: Prisma.TransactionClient, id: string, access: AccountAccess) {
  return tx.user.update({ where: { id }, data: { role: access.role, is_active: access.isActive }, select: accountFields });
}

export function deleteAccountSessions(tx: Prisma.TransactionClient, userId: string) {
  return tx.session.deleteMany({ where: { userId } });
}
