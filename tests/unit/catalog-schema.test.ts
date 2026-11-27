import { expect, it } from "vitest";
import { createItemSchema, parseCatalogQuery, updateItemSchema } from "../../src/modules/catalog/schema";

const metadata = { code: " atK-001 ", name: " Kertas A4 ", unit: " BOX ", location: " Rak 2 " };

it("menormalisasi kode dan metadata tanpa menerima stok atau pembuat", () => {
  expect(createItemSchema.parse(metadata)).toEqual({ code: "ATK-001", name: "Kertas A4", unit: "BOX", location: "Rak 2" });
  expect(createItemSchema.safeParse({ ...metadata, stock: 4 }).success).toBe(false);
  expect(createItemSchema.safeParse({ ...metadata, createdById: "actor" }).success).toBe(false);
});

it.each([
  { code: " ", unit: "BOX" }, { code: "X".repeat(65) }, { name: "n".repeat(161) }, { unit: "u".repeat(33) },
  { location: "l".repeat(121) }, { name: "Nama\0" }, { location: undefined },
])("menolak metadata di luar batas (%j)", (patch) => {
  expect(createItemSchema.safeParse({ ...metadata, ...patch }).success).toBe(false);
});

it("memerlukan minimal satu field metadata pada PATCH", () => {
  expect(updateItemSchema.safeParse({}).success).toBe(false);
  expect(updateItemSchema.parse({ location: " Gudang 2 " })).toEqual({ location: "Gudang 2" });
});

it("memakai default pencarian, urutan, dan pagination yang sama untuk halaman dan API", () => {
  const expected = { q: "", page: 1, limit: 20, sort: "code", direction: "asc" };
  expect(parseCatalogQuery({})).toEqual({ success: true, data: expected });
  expect(parseCatalogQuery(new URLSearchParams())).toEqual({ success: true, data: expected });
  expect(parseCatalogQuery(new URLSearchParams("limit=100&direction=desc&page=2")).data).toMatchObject({ limit: 100, page: 2, direction: "desc" });
});

it.each(["page=0", "page=2147483648", "page=1.5", "limit=101", "sort=location", "direction=DESC", "page=1&page=2", "unknown=1"])(
  "menolak filter tidak sah (%s)", (query) => {
    expect(parseCatalogQuery(new URLSearchParams(query)).success).toBe(false);
  },
);
