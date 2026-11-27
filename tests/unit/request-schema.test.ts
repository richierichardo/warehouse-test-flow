import { expect, it } from "vitest";
import { createRequestSchema, parseRequestQuery } from "../../src/modules/requisitions/schema";

const itemId = "16f06a72-18ba-4967-96c8-8b62941e12fd";
const input = { itemId, quantity: 3 };

it("menormalisasi UUID dan catatan untuk pengiriman ulang", () => {
  expect(createRequestSchema.parse({ ...input, itemId: itemId.toUpperCase(), notes: " Bahan rapat " })).toEqual({ ...input, notes: "Bahan rapat" });
  expect(createRequestSchema.parse({ ...input, notes: " " })).toEqual({ ...input, notes: null });
  expect(createRequestSchema.parse(input)).toEqual({ ...input, notes: null });
});

it.each([0, -1, 1.5, "3", "NaN", 1_000_001])("menolak jumlah %s", (quantity) => {
  expect(createRequestSchema.safeParse({ ...input, quantity }).success).toBe(false);
});

it("menolak field yang dikelola server dan catatan yang tidak valid", () => {
  expect(createRequestSchema.safeParse({ ...input, requesterId: itemId }).success).toBe(false);
  expect(createRequestSchema.safeParse({ ...input, notes: "x".repeat(501) }).success).toBe(false);
  expect(createRequestSchema.safeParse({ ...input, notes: "NUL\0" }).success).toBe(false);
});

it("mendukung filter status dan pagination", () => {
  expect(parseRequestQuery(new URLSearchParams("status=")).data).toMatchObject({ page: 1, limit: 20 });
  expect(parseRequestQuery(new URLSearchParams("status=REJECTED&page=2&limit=1")).data).toEqual({ status: "REJECTED", page: 2, limit: 1 });
});

it.each(["status=INVALID", "status=PENDING&status=APPROVED", "limit=101", "page=0", "page=3000000000", "requesterId=orang-lain"])("menolak filter %s", (query) => {
  expect(parseRequestQuery(new URLSearchParams(query)).success).toBe(false);
});
