import "server-only";

import { userRoles } from "./auth-options";
import { HttpError } from "./http";

type Role = (typeof userRoles)[number];

const permissionsByRole = {
  EMPLOYEE: ["catalog:read", "request:create", "request:read-own"],
  WAREHOUSE: ["catalog:read", "catalog:write", "receipt:create", "receipt:read", "request:read-all", "request:decide", "movement:read"],
  SUPERADMIN: ["catalog:read", "receipt:read", "request:read-all", "movement:read", "user:read", "user:update-access", "session:revoke"],
} as const satisfies Record<Role, readonly string[]>;

export type Permission = (typeof permissionsByRole)[Role][number];
export type RequiredPermissions = readonly [Permission, ...Permission[]];

function isKnownRole(role: unknown): role is Role {
  return userRoles.some((candidate) => candidate === role);
}

export function hasPermission(role: unknown, permission: Permission): boolean {
  if (!isKnownRole(role)) return false;
  const granted: readonly Permission[] = permissionsByRole[role];
  return granted.includes(permission);
}

export function hasAnyPermission(role: unknown, permissions: RequiredPermissions): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function requirePermission(role: unknown, permissions: RequiredPermissions): void {
  if (!hasAnyPermission(role, permissions)) {
    throw new HttpError(403, "FORBIDDEN", "Anda tidak memiliki izin untuk melakukan tindakan ini.");
  }
}
