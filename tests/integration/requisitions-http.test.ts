import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDb } from "../../src/lib/db";
import { deleteCatalogFixtures, receiveFixtureStock } from "../catalog-fixture";
import { testDatabaseUrl } from "./database";
import { startNextTestApp } from "./next-app";

vi.mock("server-only", () => ({}));

const origin = "https://warehouse.example.test";
const limiterSecret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const users = (["EMPLOYEE", "EMPLOYEE", "WAREHOUSE", "SUPERADMIN"] as const).map((role, index) => ({
  id: randomUUID(), email: `${randomUUID()}@example.test`, name: `Fixture ${role} ${index + 1}`, role,
}));
const [employee, coworker, warehouse, admin] = users;
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

function submit(itemId: string, quantity: number, actor = employee, key: string = randomUUID(), notes?: string) {
  return request("/api/requests", actor, { key, body: { itemId, quantity, notes } });
}

function createItem() {
  return db.item.create({ data: { code: `REQUEST-${randomBytes(8).toString("hex").toUpperCase()}`,
    name: "Barang uji permintaan", unit: "BOX", location: "Rak A", createdById: warehouse.id } });
}

async function assertError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ error: { code }, requestId: expect.any(String) });
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

it("melindungi pengajuan dan riwayat dengan session, role, dan origin", async () => {
  const { id } = await createItem();
  const options = { key: randomUUID(), body: { itemId: id, quantity: 7 } };
  await assertError(await request("/api/requests"), 401, "UNAUTHENTICATED");
  await assertError(await request(`/api/requests/${randomUUID()}`), 401, "UNAUTHENTICATED");
  await assertError(await request("/api/requests", undefined, options), 401, "UNAUTHENTICATED");
  for (const user of [warehouse, admin]) await assertError(await request("/api/requests", user, options), 403, "FORBIDDEN");
  for (const invalidOrigin of [null, "https://invalid.example.test"]) {
    await assertError(await request("/api/requests", employee, { ...options, origin: invalidOrigin }), 403, "INVALID_ORIGIN");
  }
  await assertError(await request("/api/requests", employee, { body: options.body }), 422, "INVALID_IDEMPOTENCY_KEY");
  expect(await db.itemRequest.count({ where: { itemId: id } })).toBe(0);
}, 12_000);

it("menolak jumlah dan field milik server tanpa menyimpan data", async () => {
  const { id } = await createItem();
  for (const extra of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: "7" }, { quantity: "NaN" }, { quantity: 1_000_001 },
    { requesterId: coworker.id }, { status: "APPROVED" }, { stock: 8 }, { notes: "x".repeat(501) }]) {
    await assertError(await request("/api/requests", employee, { key: randomUUID(), body: { itemId: id, quantity: 7, ...extra } }), 422, "VALIDATION_ERROR");
  }
  await assertError(await submit(randomUUID(), 7), 404, "ITEM_NOT_FOUND");
  expect(await db.itemRequest.count({ where: { itemId: id } })).toBe(0);
  expect(await db.item.findUnique({ where: { id }, select: { stock: true } })).toEqual({ stock: 0 });
}, 15_000);

it("menerima pengajuan saat stok nol atau kurang tanpa mengubah saldo dan ledger", async () => {
  const zero = await createItem();
  const limited = await createItem();
  await receiveFixtureStock(db, limited.id, warehouse.id, 2);
  for (const [item, expectedStock] of [[zero, 0], [limited, 2]] as const) {
    const before = await db.stockMovement.findMany({ where: { itemId: item.id } });
    const response = await submit(item.id, 7, employee, randomUUID(), "  Bahan rapat  ");
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { data } = await response.json();
    expect(data).toMatchObject({ requestNo: expect.stringMatching(/^REQ-/), quantity: 7, status: "PENDING", notes: "Bahan rapat", item: { id: item.id } });
    expect(data).not.toHaveProperty("requesterId");
    expect(data).not.toHaveProperty("idempotencyKey");
    expect(data).not.toHaveProperty("payloadHash");
    const saved = await db.itemRequest.findUnique({ where: { id: data.id }, select: { requesterId: true, status: true } });
    expect(saved).toEqual({ requesterId: employee.id, status: "PENDING" });
    expect(await db.item.findUnique({ where: { id: item.id }, select: { stock: true } })).toEqual({ stock: expectedStock });
    expect(await db.stockMovement.findMany({ where: { itemId: item.id } })).toEqual(before);
  }
});

it("membedakan payload berbeda dan mengizinkan key yang sama untuk dua pemohon", async () => {
  const { id } = await createItem();
  const key = randomUUID();
  const first = await submit(id, 7, employee, key, " Rapat ");
  expect(first.status).toBe(201);
  const original = await first.json();
  const replay = await submit(id.toUpperCase(), 7, employee, key.toUpperCase(), "Rapat");
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(original);
  await assertError(await submit(id, 8, employee, key, "Rapat"), 409, "IDEMPOTENCY_CONFLICT");
  const other = await submit(id, 8, coworker, key, "Rapat lain");
  expect(other.status).toBe(201);
  expect((await other.json()).data.id).not.toBe(original.data.id);
  expect(await db.itemRequest.count({ where: { itemId: id, idempotencyKey: key } })).toBe(2);
});

it("mengembalikan satu hasil dari dua insert paralel dengan key yang sama", async () => {
  const { id } = await createItem();
  const key = randomUUID();
  await db.$executeRaw`CREATE FUNCTION test_stage07_request_gate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(707071);
      RETURN NEW;
    END;
  $$`;
  try {
    await db.$executeRaw`CREATE TRIGGER test_stage07_request_gate BEFORE INSERT ON item_request FOR EACH ROW
      WHEN (NEW.quantity = 431307) EXECUTE FUNCTION test_stage07_request_gate()`;
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocker = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(707071)`;
      acquired.resolve();
      await release.promise;
    }, { timeout: 12_000 });
    void blocker.catch(acquired.reject);
    await acquired.promise;

    const pair = Promise.all([submit(id, 431307, employee, key), submit(id, 431307, employee, key)]);
    let blocked = 0;
    try {
      for (let attempt = 0; attempt < 40 && blocked < 2; attempt += 1) {
        const [row] = await db.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()
            AND query LIKE '%INSERT INTO%item_request%' AND cardinality(pg_blocking_pids(pid)) > 0
        `;
        blocked = row.count;
        if (blocked < 2) await delay(65);
      }
    } finally {
      release.resolve();
      await blocker;
    }

    const responses = await pair;
    expect(blocked).toBe(2);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    const [first, second] = await Promise.all(responses.map((response) => response.json()));
    expect(second).toEqual(first);
    expect(await db.itemRequest.count({ where: { itemId: id } })).toBe(1);
  } finally {
    await db.$executeRaw`DROP TRIGGER IF EXISTS test_stage07_request_gate ON item_request`;
    await db.$executeRaw`DROP FUNCTION IF EXISTS test_stage07_request_gate()`;
  }
}, 18_000);

it("mengisolasi daftar, jumlah hasil, dan detail antarpegawai serta membuka antrean untuk kedua role baca", async () => {
  const { id: itemId } = await createItem();
  const first = await db.itemRequest.create({ data: {
    itemId, quantity: 2, status: "REJECTED", requesterId: employee.id, idempotencyKey: randomUUID(), requestNo: randomUUID(), payloadHash: "fixture",
    decidedById: warehouse.id, decidedAt: new Date(), rejectionReason: "Alasan A", notes: "Catatan internal A", createdAt: new Date("2025-01-01T00:00:00Z"),
  } });
  const second = await db.itemRequest.create({ data: {
    itemId, quantity: 3, status: "REJECTED", requesterId: coworker.id, idempotencyKey: randomUUID(), requestNo: randomUUID(), payloadHash: "fixture",
    decidedById: warehouse.id, decidedAt: new Date(), rejectionReason: "Alasan B", notes: "Catatan internal B", createdAt: new Date("2025-01-01T00:00:00Z"),
  } });
  const query = "/api/requests?status=REJECTED&limit=1";
  for (const [actor, own, foreign] of [[employee, first, second], [coworker, second, first]] as const) {
    const listing = await request(query, actor);
    expect(listing.status).toBe(200);
    const body = await listing.json();
    expect(body).toMatchObject({ data: [{ id: own.id, status: "REJECTED" }], meta: { page: 1, limit: 1, total: 1, totalPages: 1 } });
    expect(body.data[0]).not.toHaveProperty("notes");
    expect(body.data[0]).not.toHaveProperty("requester");
    const detail = await request(`/api/requests/${own.id}`, actor);
    expect(await detail.json()).toMatchObject({ data: { id: own.id, notes: own.notes, rejectionReason: own.rejectionReason } });
    await assertError(await request(`/api/requests/${foreign.id}`, actor), 404, "REQUEST_NOT_FOUND");
    await assertError(await request(`/api/requests/${randomUUID()}`, actor), 404, "REQUEST_NOT_FOUND");
    await assertError(await request(`/api/requests?requesterId=${foreign.requesterId}`, actor), 422, "VALIDATION_ERROR");
  }

  const expectedIds = [first.id, second.id].sort().reverse();
  for (const actor of [warehouse, admin]) {
    for (const page of [1, 2]) {
      const listing = await request(`${query}&page=${page}`, actor);
      expect(await listing.json()).toMatchObject({ data: [{ id: expectedIds[page - 1] }], meta: { page, total: 2, totalPages: 2 } });
    }
    const detail = await request(`/api/requests/${first.id}`, actor);
    const body = await detail.json();
    expect(body).toMatchObject({ data: { id: first.id, requester: { name: employee.name }, notes: first.notes } });
    expect(body.data.requester).not.toHaveProperty("email");
    expect(body.data).not.toHaveProperty("payloadHash");
  }
}, 15_000);
