import { expect, it } from "vitest";
import { accountAccessSchema, accountIdSchema, parseAdminQuery, revokeSessionsSchema } from "../../src/modules/identity-access/admin-schema";

it("menerima perubahan role atau status secara terpisah", () => {
  expect(accountAccessSchema.parse({ role: "WAREHOUSE" })).toEqual({ role: "WAREHOUSE" });
  expect(accountAccessSchema.parse({ isActive: false })).toEqual({ isActive: false });
});

it.each([{}, { role: "ADMIN" }, { isActive: 1 }, { isActive: true, actorId: "other" }, { isActive: true, email: "x@example.test" }])("menolak perubahan akses di luar kontrak", (body) => {
  expect(accountAccessSchema.safeParse(body).success).toBe(false);
});

it("menerima ID opaque dan membatasi body pencabutan", () => {
  expect(accountIdSchema.parse("fixture-non-uuid")).toBe("fixture-non-uuid");
  expect(accountIdSchema.safeParse("bad\0id").success).toBe(false);
  expect(revokeSessionsSchema.safeParse({}).success).toBe(true);
  expect(revokeSessionsSchema.safeParse({ token: "value" }).success).toBe(false);
});

it("memvalidasi pagination dan query ganda", () => {
  expect(parseAdminQuery(new URLSearchParams()).data).toEqual({ page: 1, limit: 20 });
  for (const query of ["limit=101", "page=1&page=2", "page=9999999999999999999", "role=EMPLOYEE"]) {
    expect(parseAdminQuery(new URLSearchParams(query)).success).toBe(false);
  }
});
