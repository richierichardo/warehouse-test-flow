import { expect, it, vi } from "vitest";
import { HttpError } from "../../src/lib/http";
import { hasAnyPermission, hasPermission, requirePermission, type Permission } from "../../src/lib/permissions";

vi.mock("server-only", () => ({}));

const matrix = [
  ["catalog:read", true, true, true],
  ["catalog:write", false, true, false],
  ["receipt:create", false, true, false],
  ["receipt:read", false, true, true],
  ["request:create", true, false, false],
  ["request:read-own", true, false, false],
  ["request:read-all", false, true, true],
  ["request:decide", false, true, false],
  ["movement:read", false, true, true],
  ["user:read", false, false, true],
  ["user:update-access", false, false, true],
  ["session:revoke", false, false, true],
] satisfies Array<[Permission, boolean, boolean, boolean]>;

it.each(matrix)("menegakkan izin %s untuk ketiga role", (permission, employee, warehouse, admin) => {
  expect(hasPermission("EMPLOYEE", permission)).toBe(employee);
  expect(hasPermission("WAREHOUSE", permission)).toBe(warehouse);
  expect(hasPermission("SUPERADMIN", permission)).toBe(admin);
});

it.each([null, "ADMIN", "constructor", "__proto__"])("menolak role tidak dikenal (%j)", (role) => {
  expect(hasAnyPermission(role, ["catalog:read", "user:read"])).toBe(false);
  expect(() => requirePermission(role, ["catalog:read"])).toThrow(HttpError);
});

it("menerima salah satu izin yang secara eksplisit diberikan", () => {
  expect(hasAnyPermission("EMPLOYEE", ["request:read-all", "request:read-own"])).toBe(true);
  expect(hasAnyPermission("SUPERADMIN", ["request:read-all", "request:read-own"])).toBe(true);
});
