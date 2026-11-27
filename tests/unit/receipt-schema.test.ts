import { describe, expect, it } from "vitest";
import { todayInWib, validCalendarDate } from "../../src/lib/warehouse-date";
import { parseHistoryQuery } from "../../src/modules/inventory/history-query";
import { receiveGoodsSchema } from "../../src/modules/receiving/schema";

const base = { itemId: "16f06a72-18ba-4967-96c8-8b62941e12fd", quantity: 25, receivedOn: "2024-02-29", sourceName: "Toko ATK" };

describe("penerimaan barang", () => {
  it("menghitung pergantian tanggal pada tengah malam WIB", () => {
    expect(todayInWib(new Date("2026-11-26T16:59:59Z"))).toBe("2026-11-26");
    expect(todayInWib(new Date("2026-11-26T17:00:00Z"))).toBe("2026-11-27");
  });

  it("menormalisasi UUID, teks dan field opsional", () => {
    expect(receiveGoodsSchema.parse({ ...base, itemId: base.itemId.toUpperCase(), sourceName: " Toko ATK ", notes: "  " }))
      .toEqual({ ...base, deliveryNoteRef: null, notes: null });
  });

  it.each([0, -1, 0.5, "25", "NaN", Number.NaN, 1_000_001])("menolak jumlah %s", (quantity) => {
    expect(receiveGoodsSchema.safeParse({ ...base, quantity }).success).toBe(false);
  });

  it.each(["2023-02-29", "2024-02-30", "2026-1-01", "0000-01-01"])("menolak tanggal kalender %s", (date) => {
    expect(validCalendarDate(date)).toBe(false);
  });

  it("menolak tanggal masa depan dan teks melebihi batas", () => {
    expect(receiveGoodsSchema.safeParse({ ...base, receivedOn: "9999-12-31" }).success).toBe(false);
    expect(receiveGoodsSchema.safeParse({ ...base, notes: "x".repeat(501) }).success).toBe(false);
  });
});

describe("filter riwayat", () => {
  it("menerima tanggal opsional kosong dari form dan default pagination", () => {
    expect(parseHistoryQuery(new URLSearchParams("from=&to=")).data).toMatchObject({ page: 1, limit: 20 });
  });

  it.each(["from=2026-01-03&to=2026-01-02", "page=1&page=2", "limit=101", "itemId=bukan-uuid"])("menolak filter %s", (query) => {
    expect(parseHistoryQuery(new URLSearchParams(query)).success).toBe(false);
  });
});
