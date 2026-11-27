import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Prisma } from "../../src/generated/prisma/client";
import { createDb } from "../../src/lib/db";
import { testDatabaseUrl } from "./database";

vi.mock("server-only", () => ({}));

const rollback = new Error("Rollback fixture tes");
let db: ReturnType<typeof createDb>;

beforeAll(() => {
  db = createDb(testDatabaseUrl());
});

afterAll(async () => {
  await db?.$disconnect();
});

async function withFixture(check: (tx: Prisma.TransactionClient) => Promise<void>) {
  await db.$transaction(async (tx) => {
    await check(tx);
    throw rollback;
  }).catch((error: unknown) => {
    if (error !== rollback) throw error;
  });
}

async function makeRecords(tx: Prisma.TransactionClient) {
  const key = randomUUID();
  const actor = await tx.user.create({ data: { id: key, name: "Petugas Tes", email: `${key}@example.test` } });
  const itemData = { code: `TES-${key.toUpperCase()}`, name: "Kertas A4", unit: "RIM", location: "Rak B2", createdById: actor.id };
  const item = await tx.item.create({ data: itemData });
  const receiptData = {
    receiptNo: `RC-${key}`,
    itemId: item.id,
    quantity: 7,
    receivedOn: new Date("2026-11-01T00:00:00.000Z"),
    sourceName: "Pengirim Tes",
    receivedById: actor.id,
    idempotencyKey: key,
    payloadHash: "receipt-test",
  };
  const requestData = {
    requestNo: `RQ-${key}`,
    itemId: item.id,
    quantity: 3,
    requesterId: actor.id,
    idempotencyKey: key,
    payloadHash: "request-test",
  };
  const receipt = await tx.goodsReceipt.create({ data: receiptData });
  const request = await tx.itemRequest.create({ data: requestData });
  const incoming = { itemId: item.id, direction: "IN", quantity: 7, balanceAfter: 7, receiptId: receipt.id, actorId: actor.id } as const;
  const outgoing = { itemId: item.id, direction: "OUT", quantity: 3, balanceAfter: 4, requestId: request.id, actorId: actor.id } as const;

  return { actor, item, itemData, receipt, receiptData, request, requestData, incoming, outgoing };
}

const checkViolation = { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "23514" } } } };

it("menyimpan stok awal nol, tanggal dokumen, keputusan, dan urutan mutasi", () => withFixture(async (tx) => {
  const { actor, item, receipt, request, requestData, incoming, outgoing } = await makeRecords(tx);
  expect(item.stock).toBe(0);
  expect(request.status).toBe("PENDING");
  expect(receipt.receivedOn.toISOString()).toBe("2026-11-01T00:00:00.000Z");

  const decidedAt = new Date("2026-11-26T16:22:35.000+07:00");
  const approved = await tx.itemRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED", decidedById: actor.id, decidedAt },
  });
  const rejected = await tx.itemRequest.create({ data: {
    ...requestData,
    requestNo: `${request.requestNo}-rejected`,
    idempotencyKey: randomUUID(),
    status: "REJECTED",
    decidedById: actor.id,
    decidedAt: new Date(),
    rejectionReason: "Permintaan ganda",
  } });
  const first = await tx.stockMovement.create({ data: incoming });
  const second = await tx.stockMovement.create({ data: outgoing });
  const [decision] = await tx.$queryRaw<Array<{ epoch: number }>>`
    SELECT EXTRACT(EPOCH FROM decided_at)::float8 AS epoch FROM item_request WHERE id = ${request.id}::uuid
  `;
  expect(approved.status).toBe("APPROVED");
  expect(decision?.epoch).toBe(decidedAt.getTime() / 1_000);
  expect(rejected.status).toBe("REJECTED");
  expect(typeof first.id).toBe("bigint");
  expect(second.id > first.id).toBe(true);
}));

it.each([-1, 2_000_000_001])("menolak stok di luar batas (%i)", (stock) => withFixture(async (tx) => {
  const { item } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE item SET stock = ${stock} WHERE id = ${item.id}::uuid`)
    .rejects.toMatchObject(checkViolation);
}));

it("menolak kode barang ganda", () => withFixture(async (tx) => {
  const { itemData } = await makeRecords(tx);
  await expect(tx.item.create({ data: itemData })).rejects.toMatchObject({ code: "P2002" });
}));

it.each([" barang", "ÉTUI\t", "éTUI", ""])("menolak kode barang yang belum dinormalisasi (%j)", (code) => withFixture(async (tx) => {
  const { item } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE item SET code = ${code} WHERE id = ${item.id}::uuid`)
    .rejects.toMatchObject(checkViolation);
}));

it.each([0, -1, 1_000_001])("menolak kuantitas penerimaan di luar batas (%i)", (quantity) => withFixture(async (tx) => {
  const { receipt } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE goods_receipt SET quantity = ${quantity} WHERE id = ${receipt.id}::uuid`)
    .rejects.toMatchObject(checkViolation);
}));

it.each([0, -1, 1_000_001])("menolak kuantitas permintaan di luar batas (%i)", (quantity) => withFixture(async (tx) => {
  const { request } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE item_request SET quantity = ${quantity} WHERE id = ${request.id}::uuid`)
    .rejects.toMatchObject(checkViolation);
}));

it.each([0, -1, 1_000_001])("menolak kuantitas mutasi di luar batas (%i)", (quantity) => withFixture(async (tx) => {
  const { incoming } = await makeRecords(tx);
  const movement = await tx.stockMovement.create({ data: incoming });
  await expect(tx.$executeRaw`UPDATE stock_movement SET quantity = ${quantity} WHERE id = ${movement.id}`)
    .rejects.toMatchObject(checkViolation);
}));

it("menolak saldo mutasi negatif", () => withFixture(async (tx) => {
  const { incoming } = await makeRecords(tx);
  const movement = await tx.stockMovement.create({ data: incoming });
  await expect(tx.$executeRaw`UPDATE stock_movement SET balance_after = -1 WHERE id = ${movement.id}`)
    .rejects.toMatchObject(checkViolation);
}));

it("menolak idempotency key penerimaan yang sama untuk pelaku yang sama", () => withFixture(async (tx) => {
  const { receiptData } = await makeRecords(tx);
  await expect(tx.goodsReceipt.create({ data: { ...receiptData, receiptNo: randomUUID() } }))
    .rejects.toMatchObject({ code: "P2002" });
}));

it("menolak idempotency key permintaan yang sama untuk pelaku yang sama", () => withFixture(async (tx) => {
  const { requestData } = await makeRecords(tx);
  await expect(tx.itemRequest.create({ data: { ...requestData, requestNo: randomUUID() } }))
    .rejects.toMatchObject({ code: "P2002" });
}));

it("menolak metadata keputusan pada permintaan PENDING", () => withFixture(async (tx) => {
  const { actor, request } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE item_request SET decided_by = ${actor.id} WHERE id = ${request.id}::uuid`)
    .rejects.toMatchObject(checkViolation);
}));

it("menolak keputusan APPROVED tanpa pelaku dan waktu", () => withFixture(async (tx) => {
  const { request } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE item_request SET status = 'APPROVED' WHERE id = ${request.id}::uuid`)
    .rejects.toMatchObject(checkViolation);
}));

it.each([null, "  \t "])("menolak keputusan REJECTED dengan alasan kosong (%j)", (reason) => withFixture(async (tx) => {
  const { actor, request } = await makeRecords(tx);
  await expect(tx.$executeRaw`
    UPDATE item_request SET status = 'REJECTED', decided_by = ${actor.id}, decided_at = now(), rejection_reason = ${reason}
    WHERE id = ${request.id}::uuid
  `).rejects.toMatchObject(checkViolation);
}));

it("menolak arah OUT yang menunjuk penerimaan", () => withFixture(async (tx) => {
  const { incoming } = await makeRecords(tx);
  const movement = await tx.stockMovement.create({ data: incoming });
  await expect(tx.$executeRaw`UPDATE stock_movement SET direction = 'OUT' WHERE id = ${movement.id}`)
    .rejects.toMatchObject(checkViolation);
}));

it("menolak mutasi dengan dua sumber", () => withFixture(async (tx) => {
  const { incoming, request } = await makeRecords(tx);
  const movement = await tx.stockMovement.create({ data: incoming });
  await expect(tx.$executeRaw`UPDATE stock_movement SET request_id = ${request.id}::uuid WHERE id = ${movement.id}`)
    .rejects.toMatchObject(checkViolation);
}));

it.each(["incoming", "outgoing"] as const)("menolak dua mutasi untuk sumber yang sama (%s)", (direction) => withFixture(async (tx) => {
  const fixture = await makeRecords(tx);
  await tx.stockMovement.create({ data: fixture[direction] });
  await expect(tx.stockMovement.create({ data: fixture[direction] })).rejects.toMatchObject({ code: "P2002" });
}));

it("melindungi barang yang dirujuk oleh histori", () => withFixture(async (tx) => {
  const { item } = await makeRecords(tx);
  await expect(tx.item.delete({ where: { id: item.id } })).rejects.toMatchObject({ code: "P2003" });
}));

it("melindungi akun yang dirujuk oleh histori", () => withFixture(async (tx) => {
  const { actor } = await makeRecords(tx);
  await expect(tx.user.delete({ where: { id: actor.id } })).rejects.toMatchObject({ code: "P2003" });
}));

it("menolak role akun di luar allowlist", () => withFixture(async (tx) => {
  const { actor } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE "user" SET role = 'ADMIN' WHERE id = ${actor.id}`)
    .rejects.toMatchObject(checkViolation);
}));

it("menolak email akun yang belum dinormalisasi", () => withFixture(async (tx) => {
  const { actor } = await makeRecords(tx);
  await expect(tx.$executeRaw`UPDATE "user" SET email = 'KAPITAL@example.test' WHERE id = ${actor.id}`)
    .rejects.toMatchObject(checkViolation);
}));

it("menolak counter rate limit negatif", () => withFixture(async (tx) => {
  const key = randomUUID();
  await expect(tx.$executeRaw`
    INSERT INTO rate_limit_bucket (key_hash, window_start, count, expires_at)
    VALUES (${key}, now(), -1, now() + interval '1 minute')
  `).rejects.toMatchObject(checkViolation);
}));
