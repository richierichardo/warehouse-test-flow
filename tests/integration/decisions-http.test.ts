import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Prisma } from "../../src/generated/prisma/client";
import { createDb } from "../../src/lib/db";
import { todayInWib } from "../../src/lib/warehouse-date";
import { deleteCatalogFixtures, receiveFixtureStock } from "../catalog-fixture";
import { testDatabaseUrl } from "./database";
import { startNextTestApp } from "./next-app";
import { blockedQueries, holdLock } from "./pg-lock";

vi.mock("server-only", () => ({}));

const origin = "https://warehouse.example.test";
const limiterSecret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const users = (["EMPLOYEE", "WAREHOUSE", "WAREHOUSE", "SUPERADMIN"] as const).map((role, index) => ({
  id: randomUUID(), email: `${randomUUID()}@example.test`, name: `Fixture ${role} ${index + 1}`, role,
}));
const [employee, warehouse, colleague, admin] = users;
type User = (typeof users)[number];
const cookies = new Map<string, string>();
const requestLock = "%FROM item_request WHERE id =%FOR UPDATE%";
const itemLock = "%SELECT stock FROM item WHERE id%FOR UPDATE%";
let db: ReturnType<typeof createDb>;
let app: Awaited<ReturnType<typeof startNextTestApp>>;

function request(path: string, actor?: User, options: { body?: unknown; origin?: string | null; key?: string } = {}) {
  const headers = new Headers();
  if (actor) headers.set("Cookie", cookies.get(actor.id) ?? "");
  if (options.body === undefined) return app.request(path, { headers });
  if (options.origin !== null) headers.set("Origin", options.origin ?? origin);
  if (options.key) headers.set("Idempotency-Key", options.key);
  headers.set("Content-Type", "application/json");
  return app.request(path, { method: "POST", headers, body: JSON.stringify(options.body) });
}

const approve = (id: string, actor = warehouse) => request(`/api/requests/${id}/approve`, actor, { body: {} });
const reject = (id: string, reason: string, actor = warehouse) => request(`/api/requests/${id}/reject`, actor, { body: { reason } });

async function fixtureItem(stock = 10) {
  const item = await db.item.create({ data: { code: `DECISION-${randomBytes(8).toString("hex").toUpperCase()}`,
    name: "Barang keputusan", unit: "BOX", location: "Rak A", createdById: warehouse.id } });
  await receiveFixtureStock(db, item.id, warehouse.id, stock);
  return item;
}

function fixtureRequest(itemId: string, quantity = 7) {
  return db.itemRequest.create({ data: {
    itemId, quantity, requesterId: employee.id, requestNo: `FIXTURE-${randomUUID()}`, idempotencyKey: randomUUID(), payloadHash: "fixture",
  } });
}

function decisionState(id: string) {
  return db.itemRequest.findUniqueOrThrow({ where: { id }, select: { status: true, decidedById: true, decidedAt: true, rejectionReason: true } });
}

function ledger(itemId: string) {
  return db.stockMovement.findMany({ where: { itemId }, orderBy: { id: "asc" } });
}

async function stock(id: string) {
  return (await db.item.findUniqueOrThrow({ where: { id }, select: { stock: true } })).stock;
}

async function assertError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ error: { code }, requestId: expect.any(String) });
}

async function raceBehindLock(lock: (tx: Prisma.TransactionClient) => Promise<unknown>, pattern: string, run: () => [Promise<Response>, Promise<Response>]) {
  const release = await holdLock(db, lock);
  const responses = Promise.all(run());
  let blocked: boolean;
  try {
    blocked = await blockedQueries(db, pattern, 2);
  } finally {
    await release();
  }
  const results = await responses;
  expect(blocked).toBe(true);
  return results;
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
    const inputs = ["login\0shared", "auth\0shared", ...ids.flatMap((id) => [`read\0${id}`, `write\0${id}`, `decision\0${id}`])];
    const keys = inputs.map((input) => createHmac("sha256", limiterSecret).update(input).digest("hex"));
    await db.$transaction([
      db.user.deleteMany({ where: { id: { in: ids } } }),
      db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } }),
    ]);
  } finally {
    await db.$disconnect();
  }
});

it("mewajibkan session petugas, origin yang sah, dan body keputusan yang valid", async () => {
  const item = await fixtureItem();
  const { id } = await fixtureRequest(item.id);
  const path = `/api/requests/${id}/approve`;
  await assertError(await request(path, undefined, { body: {} }), 401, "UNAUTHENTICATED");
  for (const actor of [employee, admin]) {
    await assertError(await approve(id, actor), 403, "FORBIDDEN");
    await assertError(await reject(id, "Alasan", actor), 403, "FORBIDDEN");
  }
  for (const invalidOrigin of [null, "https://other.example.test"]) {
    await assertError(await request(path, warehouse, { body: {}, origin: invalidOrigin }), 403, "INVALID_ORIGIN");
  }
  await assertError(await request(path, warehouse, { body: { quantity: 1, decidedById: colleague.id } }), 422, "VALIDATION_ERROR");
  await assertError(await request(`/api/requests/${id}/reject`, warehouse, { body: {} }), 422, "VALIDATION_ERROR");
  for (const reason of [" ", "x".repeat(501), "Alasan\0"]) await assertError(await reject(id, reason), 422, "VALIDATION_ERROR");
  await assertError(await approve(randomUUID()), 404, "REQUEST_NOT_FOUND");
  expect(await decisionState(id)).toEqual({ status: "PENDING", decidedAt: null, decidedById: null, rejectionReason: null });
  expect(await stock(item.id)).toBe(10);
}, 15_000);

it("mengurangi saldo satu kali dan menolak approval ketika saldo kurang", async () => {
  const item = await fixtureItem();
  const first = await fixtureRequest(item.id);
  const second = await fixtureRequest(item.id, 4);
  const response = await approve(first.id);
  expect(response.status).toBe(200);
  const original = await response.json();
  expect(original).toMatchObject({ data: { id: first.id, status: "APPROVED", rejectionReason: null, decidedBy: { name: warehouse.name } } });
  const initialDecision = await decisionState(first.id);
  const replay = await approve(first.id, colleague);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(original);
  await assertError(await reject(first.id, "Alasan pengganti", colleague), 409, "ALREADY_DECIDED");
  expect(await decisionState(first.id)).toEqual(initialDecision);

  await assertError(await approve(second.id), 409, "INSUFFICIENT_STOCK");
  expect(await decisionState(second.id)).toEqual({ status: "PENDING", decidedById: null, decidedAt: null, rejectionReason: null });
  expect(await stock(item.id)).toBe(3);
  const rows = await ledger(item.id);
  expect(rows).toMatchObject([{ direction: "IN", balanceAfter: 10 }, {
    direction: "OUT", quantity: 7, balanceAfter: 3, requestId: first.id, receiptId: null, actorId: warehouse.id, postedAt: initialDecision.decidedAt,
  }]);
});

it("menyimpan alasan penolakan dan mengembalikan metadata awal untuk replay setara", async () => {
  const item = await fixtureItem();
  const { id } = await fixtureRequest(item.id);
  const before = await ledger(item.id);
  const response = await reject(id, "  Barang sudah tersedia di unit.  ");
  expect(response.status).toBe(200);
  const original = await response.json();
  expect(original).toMatchObject({ data: { id, status: "REJECTED", rejectionReason: "Barang sudah tersedia di unit.", decidedBy: { name: warehouse.name } } });
  const initialDecision = await decisionState(id);
  const replay = await reject(id, "Barang sudah tersedia di unit.", colleague);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(original);
  await assertError(await reject(id, "Alasan berubah", colleague), 409, "ALREADY_DECIDED");
  await assertError(await approve(id, colleague), 409, "ALREADY_DECIDED");
  expect(await decisionState(id)).toEqual(initialDecision);
  expect(await stock(item.id)).toBe(10);
  expect(await ledger(item.id)).toEqual(before);
});

it("menyerialkan dua approval qty 7 pada stok 10 hingga hanya satu yang diterima", async () => {
  const item = await fixtureItem();
  const [first, second] = await Promise.all([fixtureRequest(item.id), fixtureRequest(item.id)]);
  const responses = await raceBehindLock((tx) => tx.$queryRaw`SELECT id FROM item WHERE id = ${item.id}::uuid FOR UPDATE`, itemLock,
    () => [approve(first.id), approve(second.id, colleague)]);
  expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  const winner = responses[0].ok ? first : second;
  const waiting = responses[0].ok ? second : first;
  for (const response of responses) {
    if (response.ok) expect(await response.json()).toMatchObject({ data: { id: winner.id, status: "APPROVED" } });
    else await assertError(response, 409, "INSUFFICIENT_STOCK");
  }
  expect(await decisionState(waiting.id)).toEqual({ status: "PENDING", decidedById: null, decidedAt: null, rejectionReason: null });
  expect(await stock(item.id)).toBe(3);
  expect(await ledger(item.id)).toMatchObject([{ direction: "IN" }, { direction: "OUT", requestId: winner.id, quantity: 7, balanceAfter: 3 }]);
}, 15_000);

it("merekam satu OUT untuk dua approval paralel pada permintaan yang sama", async () => {
  const item = await fixtureItem();
  const { id } = await fixtureRequest(item.id);
  const responses = await raceBehindLock((tx) => tx.$queryRaw`SELECT id FROM item_request WHERE id = ${id}::uuid FOR UPDATE`, requestLock,
    () => [approve(id), approve(id, colleague)]);
  expect(responses.map(({ status }) => status)).toEqual([200, 200]);
  const [original, replay] = await Promise.all(responses.map((response) => response.json()));
  expect(original).toEqual(replay);
  expect(original).toMatchObject({ data: { id, status: "APPROVED" } });
  const decided = await decisionState(id);
  expect(original.data.decidedAt).toBe(decided.decidedAt?.toISOString());
  expect(await stock(item.id)).toBe(3);
  expect(await ledger(item.id)).toMatchObject([{ direction: "IN" }, { direction: "OUT", requestId: id, actorId: decided.decidedById }]);
}, 15_000);

it("menerima tepat satu keputusan terminal saat approve bersaing dengan reject", async () => {
  const item = await fixtureItem();
  const { id } = await fixtureRequest(item.id);
  const [approval, rejection] = await raceBehindLock((tx) => tx.$queryRaw`SELECT id FROM item_request WHERE id = ${id}::uuid FOR UPDATE`, requestLock,
    () => [approve(id), reject(id, "Persediaan unit cukup", colleague)]);
  expect([approval.status, rejection.status].sort()).toEqual([200, 409]);
  const expected = approval.ok ? "APPROVED" : "REJECTED";
  expect(await (approval.ok ? approval : rejection).json()).toMatchObject({ data: { id, status: expected } });
  await assertError(approval.ok ? rejection : approval, 409, "ALREADY_DECIDED");
  expect(await decisionState(id)).toMatchObject({ status: expected });
  expect(await stock(item.id)).toBe(approval.ok ? 3 : 10);
  const out = (await ledger(item.id)).filter(({ direction }) => direction === "OUT");
  expect(out).toHaveLength(approval.ok ? 1 : 0);
}, 15_000);

it("melakukan rollback saldo, keputusan, dan ledger saat insert OUT gagal", async () => {
  const item = await fixtureItem();
  const { id } = await fixtureRequest(item.id, 6);
  const before = await ledger(item.id);
  await db.$executeRaw`CREATE FUNCTION test_stage08_out_rollback() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (SELECT stock FROM item WHERE id = NEW.item_id) = NEW.balance_after THEN
        RAISE EXCEPTION 'fixture rollback after stock update';
      END IF;
      RETURN NEW;
    END;
  $$`;
  try {
    await db.$executeRaw`CREATE TRIGGER test_stage08_out_rollback BEFORE INSERT ON stock_movement FOR EACH ROW
      WHEN (NEW.direction = 'OUT' AND NEW.quantity = 6) EXECUTE FUNCTION test_stage08_out_rollback()`;
    await assertError(await approve(id), 503, "SERVICE_UNAVAILABLE");
    expect(await stock(item.id)).toBe(10);
    expect(await ledger(item.id)).toEqual(before);
    expect(await decisionState(id)).toEqual({ status: "PENDING", decidedById: null, decidedAt: null, rejectionReason: null });
  } finally {
    await db.$executeRaw`DROP TRIGGER IF EXISTS test_stage08_out_rollback ON stock_movement`;
    await db.$executeRaw`DROP FUNCTION IF EXISTS test_stage08_out_rollback()`;
  }
  const retried = await approve(id);
  expect(retried.status).toBe(200);
  await retried.body?.cancel();
  expect(await stock(item.id)).toBe(4);
  expect(await ledger(item.id)).toMatchObject([{ direction: "IN" }, { direction: "OUT", requestId: id, balanceAfter: 4 }]);
}, 15_000);

it("menyerialkan penerimaan backdate dengan approval dan merekonsiliasi kartu stok", async () => {
  const item = await fixtureItem();
  const { id, requestNo } = await fixtureRequest(item.id);
  const [approval, receipt] = await raceBehindLock((tx) => tx.$queryRaw`SELECT id FROM item WHERE id = ${item.id}::uuid FOR UPDATE`, itemLock,
    () => [approve(id), request("/api/receipts", colleague, { key: randomUUID(), body: {
      itemId: item.id, quantity: 5, receivedOn: "2024-01-01", sourceName: "Toko ATK",
    } })]);
  expect(approval.status).toBe(200);
  await approval.body?.cancel();
  expect(receipt.status).toBe(201);
  const { data: receiptData } = await receipt.json();
  const rows = await ledger(item.id);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({ direction: "IN", quantity: 10, balanceAfter: 10 });
  let balance = 0;
  for (const row of rows) {
    balance += row.direction === "IN" ? row.quantity : -row.quantity;
    expect(row.balanceAfter).toBe(balance);
  }
  expect(balance).toBe(8);
  expect(await stock(item.id)).toBe(balance);
  expect(rows.find(({ requestId }) => requestId === id)).toMatchObject({ direction: "OUT", quantity: 7 });

  const path = `/api/movements?itemId=${item.id}`;
  const all = await request(path, admin);
  expect(all.status).toBe(200);
  const history = await all.json();
  expect(history.data.map((row: { id: string }) => row.id)).toEqual(rows.map(({ id: movementId }) => movementId.toString()).reverse());
  expect(history.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ direction: "OUT", requestNo, receivedOn: null, receiptNo: null }),
    expect.objectContaining({ direction: "IN", requestNo: null, receivedOn: "2024-01-01", receiptNo: receiptData.receiptNo }),
  ]));
  const outDay = todayInWib(rows.find(({ direction }) => direction === "OUT")?.postedAt);
  const out = await request(`${path}&direction=OUT&from=${outDay}&to=${outDay}&limit=1`, warehouse);
  expect(await out.json()).toMatchObject({ data: [{ direction: "OUT", requestNo }], meta: { total: 1 } });
  const incoming = await request(`${path}&direction=IN&limit=1&page=2`, admin);
  expect(await incoming.json()).toMatchObject({ data: [{ id: rows[0].id.toString(), direction: "IN" }], meta: { total: 2, page: 2 } });
  await assertError(await request(`${path}&direction=OTHER`, admin), 422, "VALIDATION_ERROR");
}, 15_000);
