import { expect, it } from "vitest";
import { parseHistoryQuery, parseMovementQuery } from "../../src/modules/inventory/history-query";
import { approveRequestSchema, rejectRequestSchema } from "../../src/modules/requisitions/schema";

it("menerima objek kosong untuk persetujuan dan menolak field tambahan", () => {
  expect(approveRequestSchema.safeParse({}).success).toBe(true);
  expect(approveRequestSchema.safeParse({ decidedById: "lain" }).success).toBe(false);
});

it("menormalisasi alasan penolakan untuk replay", () => {
  expect(rejectRequestSchema.parse({ reason: "  Ajukan ulang besok.  " })).toEqual({ reason: "Ajukan ulang besok." });
});

it.each([undefined, "  ", "Alasan\0", "x".repeat(501)])("menolak alasan yang hilang atau tidak valid", (reason) => {
  expect(rejectRequestSchema.safeParse({ reason }).success).toBe(false);
});

it("menerima filter mutasi opsional bersama tanggal dan pagination", () => {
  expect(parseMovementQuery(new URLSearchParams("direction=&from=&to=")).data).toMatchObject({ page: 1, limit: 20 });
  expect(parseMovementQuery(new URLSearchParams("direction=OUT&from=2026-01-10&to=2026-01-12&page=2&limit=1")).data)
    .toMatchObject({ direction: "OUT", from: "2026-01-10", to: "2026-01-12", page: 2, limit: 1 });
});

it.each(["direction=SIDE", "direction=IN&direction=OUT", "direction=OUT&from=2026-01-15&to=2026-01-12"])("menolak filter mutasi %s", (query) => {
  expect(parseMovementQuery(new URLSearchParams(query)).success).toBe(false);
});

it("membatasi filter arah pada kartu stok", () => {
  expect(parseHistoryQuery(new URLSearchParams("direction=OUT")).success).toBe(false);
});
