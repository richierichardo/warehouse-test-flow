import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDb } from "../../src/lib/db";
import { deleteCatalogFixtures } from "../catalog-fixture";
import { testDatabaseUrl } from "./database";
import { startNextTestApp } from "./next-app";
import { blockedQueries, holdLock } from "./pg-lock";

vi.mock("server-only", () => ({}));

const origin = "https://warehouse.example.test";
const limiterSecret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const users = (["EMPLOYEE", "WAREHOUSE", "SUPERADMIN"] as const).map((role) => ({
  id: randomUUID(), email: `${randomUUID()}@example.test`, name: `Fixture ${role}`, role,
}));
const [employee, warehouse, admin] = users;
type User = (typeof users)[number];
const cookies = new Map<string, string>();
let db: ReturnType<typeof createDb>;
let app: Awaited<ReturnType<typeof startNextTestApp>>;

function request(path: string, actor?: User, options: { body?: unknown; key?: string; origin?: string | null } = {}) {
  const headers = new Headers();
  if (actor) headers.set("Cookie", cookies.get(actor.id) ?? "");
  if (options.body === undefined) return app.request(path, { headers });
  if (options.origin !== null) headers.set("Origin", options.origin ?? origin);
  if (options.key !== undefined) headers.set("Idempotency-Key", options.key);
  headers.set("Content-Type", "application/json");
  return app.request(path, { method: "POST", headers, body: JSON.stringify(options.body) });
}

function payload(itemId: string, quantity = 7, receivedOn = "2024-02-29") {
  return { itemId, quantity, receivedOn, sourceName: "Toko ATK", deliveryNoteRef: "SJ-001" };
}

function receive(body: ReturnType<typeof payload>, key = randomUUID()) {
  return request("/api/receipts", warehouse, { body, key });
}

function createItem(stock = 0) {
  return db.item.create({ data: { code: `RECEIVE-${randomUUID().toUpperCase()}`, name: "Barang uji", unit: "BOX", location: "Rak A", createdById: warehouse.id, stock } });
}

async function assertError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ error: { code }, requestId: expect.any(String) });
}

function state(itemId: string) {
  return db.$transaction([
    db.item.findUniqueOrThrow({ where: { id: itemId }, select: { stock: true } }),
    db.goodsReceipt.count({ where: { itemId } }),
    db.stockMovement.findMany({ where: { itemId }, orderBy: { id: "asc" }, select: { quantity: true, direction: true, balanceAfter: true } }),
  ]);
}

beforeAll(async () => {
  const url = testDatabaseUrl();
  db = createDb(url);
  const hash = await hashPassword(password);
  await db.$transaction(users.map((user) => db.user.create({ data: { ...user, accounts: { create: {
    id: randomUUID(), accountId: user.id, providerId: "credential", password: hash,
  } } } })));
  app = await startNextTestApp({ DATABASE_URL: url, APP_ORIGIN: origin, BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), RATE_LIMIT_KEY_SECRET: limiterSecret, TRUSTED_PROXY_MODE: "direct" });
  for (const user of users) {
    const response = await request("/api/auth/sign-in/email", undefined, { body: { email: user.email, password } });
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find((header) => header.startsWith("__Secure-better-auth.session_token="));
    if (!cookie) throw new Error("Cookie session fixture tidak tersedia.");
    cookies.set(user.id, cookie.split(";", 1)[0]);
    await response.body?.cancel();
  }
}, 35_000);

afterAll(async () => {
  await app?.stop();
  if (!db) return;
  try {
    await deleteCatalogFixtures(db, warehouse.id);
    const ids = users.map(({ id }) => id);
    const inputs = ["login\0shared", "auth\0shared", ...ids.flatMap((id) => [`read\0${id}`, `write\0${id}`])];
    const keys = inputs.map((input) => createHmac("sha256", limiterSecret).update(input).digest("hex"));
    await db.$transaction([
      db.user.deleteMany({ where: { id: { in: ids } } }),
      db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } }),
    ]);
  } finally {
    await db.$disconnect();
  }
});

it("memberi hak tulis hanya kepada petugas dan melindungi kedua riwayat", async () => {
  for (const path of ["/api/receipts", "/api/movements"]) {
    await assertError(await request(path), 401, "UNAUTHENTICATED");
    await assertError(await request(path, employee), 403, "FORBIDDEN");
    for (const user of [warehouse, admin]) {
      const response = await request(path, user);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await response.body?.cancel();
    }
  }
  const { id } = await createItem();
  const options = { body: payload(id), key: randomUUID() };
  await assertError(await request("/api/receipts", undefined, options), 401, "UNAUTHENTICATED");
  for (const user of [employee, admin]) await assertError(await request("/api/receipts", user, options), 403, "FORBIDDEN");
  for (const invalidOrigin of [null, "https://invalid.example.test"]) {
    await assertError(await request("/api/receipts", warehouse, { ...options, origin: invalidOrigin }), 403, "INVALID_ORIGIN");
  }
  await assertError(await request("/api/receipts", warehouse, { body: options.body }), 422, "INVALID_IDEMPOTENCY_KEY");
  expect(await state(id)).toEqual([{ stock: 0 }, 0, []]);
}, 12_000);

it("menolak jumlah, tanggal dan field palsu serta menjaga batas saldo", async () => {
  const { id } = await createItem(1_999_999_999);
  const base = payload(id);
  for (const extra of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: "7" }, { quantity: "NaN" }, { quantity: 1_000_001 },
    { receivedOn: "2023-02-29" }, { receivedOn: "9999-12-31" }, { sourceName: " " }, { stock: 0 }, { receivedById: admin.id }]) {
    await assertError(await request("/api/receipts", warehouse, { body: { ...base, ...extra }, key: randomUUID() }), 422, "VALIDATION_ERROR");
  }
  await assertError(await receive(base), 409, "STOCK_LIMIT_EXCEEDED");
  await assertError(await receive(payload(randomUUID())), 404, "ITEM_NOT_FOUND");
  expect(await state(id)).toEqual([{ stock: 1_999_999_999 }, 0, []]);
  expect((await receive(payload(id, 1))).status).toBe(201);
  expect(await state(id)).toEqual([{ stock: 2_000_000_000 }, 1, [{ direction: "IN", quantity: 1, balanceAfter: 2_000_000_000 }]]);
}, 15_000);

it("mengembalikan receipt awal untuk payload setara dan menerima surat jalan berulang", async () => {
  const { id } = await createItem();
  const key = randomUUID();
  const body = payload(id);
  const created = await receive(body, key);
  expect(created.status).toBe(201);
  const original = await created.json();
  expect(original.data).toMatchObject({ sourceName: body.sourceName, deliveryNoteRef: body.deliveryNoteRef, notes: null,
    balanceAfter: 7, receivedOn: body.receivedOn, item: { id }, receivedBy: { name: warehouse.name } });
  expect(original.data).not.toHaveProperty("payloadHash");
  expect(original.data).not.toHaveProperty("idempotencyKey");
  const next = await receive(payload(id, 3));
  expect(next.status).toBe(201);
  expect((await next.json()).data.receiptNo).not.toBe(original.data.receiptNo);

  const replay = await request("/api/receipts", warehouse, { key: key.toUpperCase(), body: {
    ...body, itemId: id.toUpperCase(), sourceName: ` ${body.sourceName} `, notes: "  ",
  } });
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(original);
  await assertError(await receive(payload(id, 8), key), 409, "IDEMPOTENCY_CONFLICT");
  expect(await state(id)).toEqual([{ stock: 10 }, 2, [
    { direction: "IN", quantity: 7, balanceAfter: 7 }, { direction: "IN", quantity: 3, balanceAfter: 10 },
  ]]);
});

it.each([true, false])("menyerialkan dua penerimaan pada item sama (key sama: %s)", async (sameKey) => {
  const { id } = await createItem();
  const release = await holdLock(db, (tx) => tx.$queryRaw`SELECT id FROM item WHERE id = ${id}::uuid FOR UPDATE`);
  const key = randomUUID();
  const pair = Promise.all([receive(payload(id), key), receive(payload(id), sameKey ? key : randomUUID())]);
  let simultaneous: boolean;
  try {
    simultaneous = await blockedQueries(db, "%SELECT stock FROM item WHERE id%", 2);
  } finally {
    await release();
  }
  const responses = await pair;
  expect(simultaneous).toBe(true);
  expect(responses.map(({ status }) => status).sort()).toEqual(sameKey ? [200, 201] : [201, 201]);
  const receipts = await Promise.all(responses.map((response) => response.json()));
  if (sameKey) expect(receipts[0]).toEqual(receipts[1]);
  const movement = { direction: "IN", quantity: 7, balanceAfter: 7 };
  expect(await state(id)).toEqual(sameKey ? [{ stock: 7 }, 1, [movement]] : [{ stock: 14 }, 2, [movement, { ...movement, balanceAfter: 14 }]]);
}, 15_000);

async function withTestMovementTrigger(run: () => Promise<void>) {
  await db.$executeRaw`CREATE OR REPLACE FUNCTION test_stage06_movement_gate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.quantity = 400001 THEN
        PERFORM pg_advisory_xact_lock(606061);
      ELSIF NEW.quantity = 400002 THEN
        IF (SELECT stock FROM item WHERE id = NEW.item_id) = NEW.balance_after THEN
          RAISE EXCEPTION 'fixture rollback after stock update';
        END IF;
      END IF;
      RETURN NEW;
    END;
  $$`;
  try {
    await db.$executeRaw`CREATE TRIGGER test_stage06_movement_gate BEFORE INSERT ON stock_movement
      FOR EACH ROW EXECUTE FUNCTION test_stage06_movement_gate()`;
    await run();
  } finally {
    await db.$executeRaw`DROP TRIGGER IF EXISTS test_stage06_movement_gate ON stock_movement`;
    await db.$executeRaw`DROP FUNCTION IF EXISTS test_stage06_movement_gate()`;
  }
}

it("menangani race unique key ketika dua payload mengunci item berbeda", async () => {
  const first = await createItem();
  const second = await createItem();
  const key = randomUUID();
  await withTestMovementTrigger(async () => {
    const release = await holdLock(db, (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(606061)`);
    const winner = receive(payload(first.id, 400001), key);
    let contender: Promise<Response> | undefined;
    let ledgerWait = false;
    let keyWait = false;
    try {
      ledgerWait = await blockedQueries(db, "%INSERT INTO%stock_movement%", 1);
      contender = receive(payload(second.id), key);
      keyWait = await blockedQueries(db, "%INSERT INTO%goods_receipt%", 1);
    } finally {
      await release();
    }
    const [won, denied] = await Promise.all([winner, contender]);
    expect(ledgerWait && keyWait).toBe(true);
    expect(won.status).toBe(201);
    await won.body?.cancel();
    if (!denied) throw new Error("Permintaan pembanding belum dimulai.");
    await assertError(denied, 409, "IDEMPOTENCY_CONFLICT");
  });
  expect(await state(second.id)).toEqual([{ stock: 0 }, 0, []]);
  expect(await state(first.id)).toEqual([{ stock: 400001 }, 1, [{ direction: "IN", quantity: 400001, balanceAfter: 400001 }]]);
}, 18_000);

it("membatalkan semua write ketika insert mutasi gagal sesudah update saldo", async () => {
  const { id } = await createItem();
  const key = randomUUID();
  await withTestMovementTrigger(async () => {
    await assertError(await receive(payload(id, 400002), key), 503, "SERVICE_UNAVAILABLE");
    expect(await state(id)).toEqual([{ stock: 0 }, 0, []]);
  });
  expect((await receive(payload(id, 400002), key)).status).toBe(201);
  expect(await state(id)).toEqual([{ stock: 400002 }, 1, [{ direction: "IN", quantity: 400002, balanceAfter: 400002 }]]);
}, 12_000);

it("memfilter tanggal dokumen dan posting WIB tanpa mengubah urutan ledger saat backdate", async () => {
  const { id } = await createItem();
  const first = await receive(payload(id, 7, "2024-02-29"));
  const second = await receive(payload(id, 2, "2024-01-30"));
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const firstReceipt = (await first.json()).data;
  const secondReceipt = (await second.json()).data;
  const path = `/api/movements?itemId=${id}`;
  const moves = (await (await request(path, admin)).json()).data;
  expect(moves).toMatchObject([
    { receiptNo: secondReceipt.receiptNo, receivedOn: "2024-01-30", quantity: 2, direction: "IN", balanceAfter: 9 },
    { receiptNo: firstReceipt.receiptNo, receivedOn: "2024-02-29", quantity: 7, direction: "IN", balanceAfter: 7 },
  ]);
  expect(BigInt(moves[0].id)).toBeGreaterThan(BigInt(moves[1].id));
  expect((await state(id))[0].stock).toBe(moves.reduce((sum: number, move: { quantity: number }) => sum + move.quantity, 0));

  const receipt = await request(`/api/receipts?itemId=${id}&from=2024-01-30&to=2024-01-31`, admin);
  expect(await receipt.json()).toMatchObject({ data: [{ id: secondReceipt.id }], meta: { total: 1 } });
  const page = await request(`${path}&limit=1&page=2`, warehouse);
  expect(await page.json()).toMatchObject({ data: [{ id: moves[1].id }], meta: { totalPages: 2, total: 2 } });

  await db.stockMovement.update({ where: { id: BigInt(moves[0].id) }, data: { postedAt: new Date("2024-06-01T17:00:00Z") } });
  await db.stockMovement.update({ where: { id: BigInt(moves[1].id) }, data: { postedAt: new Date("2024-06-01T16:59:59Z") } });
  const wib = await request(`${path}&from=2024-06-02&to=2024-06-02`, admin);
  expect(await wib.json()).toMatchObject({ data: [{ receiptNo: secondReceipt.receiptNo }], meta: { total: 1 } });
  await assertError(await request(`${path}&from=2024-06-02&to=2024-06-01`, admin), 422, "VALIDATION_ERROR");
}, 12_000);
