import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { appendAccessAudit } from "@/modules/audit/access-audit";
import { countActiveSuperadmins, deleteAccountSessions, lockAccessAdministration, lockTargetAccount, readAccount, readAccounts,
  updateAccountAccess, type AccountRecord } from "./admin-repository";
import { accountRoleSchema, type AccessInput, type AccountAccess, type AdminAccount, type AdminQuery } from "./admin-schema";

function accessSnapshot(account: AccountRecord): AccountAccess {
  return { role: accountRoleSchema.parse(account.role), isActive: account.is_active };
}

function accountDto(account: AccountRecord): AdminAccount {
  return { id: account.id, name: account.name, email: account.email, ...accessSnapshot(account) };
}

export async function listAdminAccounts(db: PrismaClient, principal: Principal, query: AdminQuery) {
  requirePermission(principal.role, ["user:read"]);
  const { rows, total } = await db.$transaction((tx) => readAccounts(tx, query), { isolationLevel: "RepeatableRead" });
  return { data: rows.map(accountDto), meta: { ...query, total, totalPages: Math.ceil(total / query.limit) } };
}

type AdminAction = { type: "update"; access: AccessInput } | { type: "revoke" };

export function administerAccount(db: PrismaClient, principal: Principal, targetId: string, correlationId: string, action: AdminAction) {
  const permission = action.type === "update" ? "user:update-access" : "session:revoke";
  requirePermission(principal.role, [permission]);
  return db.$transaction(async (tx) => {
    await lockAccessAdministration(tx);
    const actor = await readAccount(tx, principal.id);
    requirePermission(actor?.is_active ? actor.role : null, [permission]);
    if (targetId === principal.id) throw new HttpError(403, "SELF_ACCESS", "Aksi ini tidak tersedia untuk akun sendiri.");
    const target = await lockTargetAccount(tx, targetId);
    if (!target) throw new HttpError(404, "USER_NOT_FOUND", "Akun tidak ditemukan.");
    const audit = { actorId: principal.id, targetId, correlationId };

    if (action.type === "revoke") {
      const { count } = await deleteAccountSessions(tx, targetId);
      await appendAccessAudit(tx, { ...audit, action: "SESSIONS_REVOKED", before: { sessionCount: count }, after: { sessionCount: 0 } });
      return { user: accountDto(target), revokedSessions: count };
    }

    const before = accessSnapshot(target);
    const after = { role: action.access.role ?? before.role, isActive: action.access.isActive ?? before.isActive };
    if (before.role === after.role && before.isActive === after.isActive) return { user: accountDto(target), revokedSessions: 0 };
    if (before.role === "SUPERADMIN" && before.isActive && (after.role !== "SUPERADMIN" || !after.isActive) && await countActiveSuperadmins(tx) <= 1) {
      throw new HttpError(409, "LAST_ACTIVE_SUPERADMIN", "Setidaknya satu superadmin harus tetap aktif.");
    }

    const updated = await updateAccountAccess(tx, targetId, after);
    const { count } = await deleteAccountSessions(tx, targetId);
    await appendAccessAudit(tx, { ...audit, action: "ACCESS_UPDATED", before, after });
    return { user: accountDto(updated), revokedSessions: count };
  }, { isolationLevel: "ReadCommitted" });
}
