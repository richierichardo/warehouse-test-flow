import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDb } from "../../src/lib/db";
import type { CatalogItem, ItemMetadata } from "../../src/modules/catalog/schema";
import { deleteCatalogFixtures, receiveFixtureStock } from "../catalog-fixture";
import { testDatabaseUrl } from "./database";
import { startNextTestApp } from "./next-app";

vi.mock("server-only", () => ({}));

const origin = "https://warehouse.example.test";
const secret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const prefix = `CAT-${randomBytes(5).toString("hex").toUpperCase()}`;
const [employee, warehouse, admin] = (["EMPLOYEE", "WAREHOUSE", "SUPERADMIN"] as const).map((role) => ({
  id: randomUUID(), email: `${randomUUID()}@example.test`, name: `Fixture ${role}`, role,
}));
const users = [employee, warehouse, admin];
const cookies = new Map<string, string>();
let db: ReturnType<typeof createDb>;
let app: Awaited<ReturnType<typeof startNextTestApp>>;

function metadata(code: string, name = "Barang fixture"): ItemMetadata {
  return { code, name, unit: "BOX", location: "Rak A" };
}

function request(path: string, actor?: (typeof users)[number], method = "GET", body?: unknown) {
  const headers = new Headers();
  if (actor) headers.set("Cookie", cookies.get(actor.id) ?? "");
  if (method !== "GET") headers.set("Origin", origin);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return app.request(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

function search(query: Record<string, string>, actor = warehouse) {
  return request(`/api/items?${new URLSearchParams(query)}`, actor);
}

async function assertError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ error: { code, message: expect.any(String) }, requestId: expect.any(String) });
}

async function createItem(code: string) {
  const response = await request("/api/items", warehouse, "POST", metadata(code));
  expect(response.status).toBe(201);
  const result: { data: CatalogItem } = await response.json();
  return result.data;
}

function requestFixture(itemId: string) {
  const key = randomUUID();
  return { requestNo: key, itemId, quantity: 1, requesterId: employee.id, idempotencyKey: key, payloadHash: "fixture" };
}

beforeAll(async () => {
  const url = testDatabaseUrl();
  db = createDb(url);
  const hash = await hashPassword(password);
  await db.$transaction(users.map((user) => db.user.create({ data: {
    ...user, accounts: { create: { id: randomUUID(), accountId: user.id, providerId: "credential", password: hash } },
  } })));
  await db.item.createMany({ data: [
    metadata(`${prefix}-LIST-A`, `${prefix} Binder`),
    metadata(`${prefix}-LIST-B`, `${prefix} Étui%_`),
    metadata(`${prefix}-LIST-C`, `${prefix} ÉtuiXY`),
  ].map((item) => ({ ...item, createdById: warehouse.id })) });

  app = await startNextTestApp({ DATABASE_URL: url, APP_ORIGIN: origin, BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), RATE_LIMIT_KEY_SECRET: secret, TRUSTED_PROXY_MODE: "direct" });
  for (const user of users) {
    const login = await request("/api/auth/sign-in/email", undefined, "POST", { email: user.email, password });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().find((header) => header.startsWith("__Secure-better-auth.session_token="));
    if (!cookie) throw new Error("Cookie session fixture tidak tersedia.");
    cookies.set(user.id, cookie.split(";", 1)[0]);
    await login.body?.cancel();
  }
}, 30_000);

afterAll(async () => {
  await app?.stop();
  if (!db) return;
  try {
    await deleteCatalogFixtures(db, warehouse.id);
    const ids = users.map(({ id }) => id);
    const inputs = ["login\0shared", ...ids.flatMap((id) => [`read\0${id}`, `write\0${id}`])];
    const keys = inputs.map((input) => createHmac("sha256", secret).update(input).digest("hex"));
    await db.$transaction([
      db.user.deleteMany({ where: { id: { in: ids } } }),
      db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } }),
    ]);
  } finally {
    await db.$disconnect();
  }
});

it("hanya memberi katalog kepada akun aktif dan memberi mutasi kepada petugas", async () => {
  await assertError(await request("/api/items"), 401, "UNAUTHENTICATED");
  const item = await db.item.findUniqueOrThrow({ where: { code: `${prefix}-LIST-A` }, select: { id: true } });

  for (const user of users) {
    const list = await search({ q: `${prefix}-list` }, user);
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    const result = await list.json();
    expect(result.data[0]).toEqual({ id: item.id, code: `${prefix}-LIST-A`, name: `${prefix} Binder`, unit: "BOX", location: "Rak A", stock: 0 });
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
  }
  for (const user of [employee, admin]) {
    await assertError(await request("/api/items", user, "POST", metadata(`${prefix}-DENIED`)), 403, "FORBIDDEN");
    await assertError(await request(`/api/items/${item.id}`, user, "PATCH", { name: "Ubah" }), 403, "FORBIDDEN");
  }
  expect((await request(`/api/items/${item.id}`, warehouse, "DELETE")).status).toBe(405);
});

it("mencari kode dan nama secara literal serta memberi urutan dan pagination stabil", async () => {
  const literal = await search({ q: `${prefix.toLowerCase()} étui%_` });
  expect(literal.status).toBe(200);
  const { data } = await literal.json();
  expect(data.map(({ code }: CatalogItem) => code)).toEqual([`${prefix}-LIST-B`]);

  const page = await search({ q: `${prefix}-LIST`, limit: "2", page: "2", sort: "code", direction: "desc" });
  expect(page.status).toBe(200);
  const result = await page.json();
  expect(result.data.map(({ code }: CatalogItem) => code)).toEqual([`${prefix}-LIST-A`]);
  expect(result.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  const max = await search({ q: `${prefix}-LIST`, limit: "100", sort: "name" });
  expect((await max.json()).data.map(({ code }: CatalogItem) => code)).toEqual([`${prefix}-LIST-A`, `${prefix}-LIST-B`, `${prefix}-LIST-C`]);

  for (const query of ["limit=101", "sort=location", "page=1&page=2"]) {
    await assertError(await request(`/api/items?${query}`, warehouse), 422, "VALIDATION_ERROR");
  }
});

it("menormalisasi metadata, mengambil pembuat dari session, dan memulai stok dari nol", async () => {
  const code = `${prefix}-CREATE`;
  const response = await request("/api/items", warehouse, "POST", {
    code: ` ${code.toLowerCase()} `, name: "  Kertas A4  ", unit: " RIM ", location: " Rak B ",
  });
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body).toEqual({ data: { id: expect.any(String), code, name: "Kertas A4", unit: "RIM", location: "Rak B", stock: 0 } });
  expect(await db.item.findUnique({ where: { code }, select: { createdById: true, stock: true } })).toEqual({ createdById: warehouse.id, stock: 0 });

  for (const extra of [{ stock: 123 }, { createdById: employee.id }, { actorId: admin.id }]) {
    await assertError(await request("/api/items", warehouse, "POST", { ...metadata(`${code}-INVALID`), ...extra }), 422, "VALIDATION_ERROR");
    await assertError(await request(`/api/items/${body.data.id}`, warehouse, "PATCH", { name: "Nama baru", ...extra }), 422, "VALIDATION_ERROR");
  }
  expect(await db.item.findUnique({ where: { code }, select: { name: true, stock: true } })).toEqual({ name: "Kertas A4", stock: 0 });
});

it("membatasi dua create paralel dengan kode setara ke satu baris", async () => {
  const code = `${prefix}-RACE-DUP`;
  const outcomes = await Promise.all([code, ` ${code.toLowerCase()} `].map((value) => request("/api/items", warehouse, "POST", metadata(value))));
  expect(outcomes.map(({ status }) => status).sort()).toEqual([201, 409]);
  for (const result of outcomes) {
    if (result.status === 409) await assertError(result, 409, "DUPLICATE_ITEM_CODE");
    else await result.body?.cancel();
  }
  expect(await db.item.count({ where: { code } })).toBe(1);
});

it("mengedit metadata kosong histori dan melindungi kode serta satuan sesudah permintaan", async () => {
  const item = await createItem(`${prefix}-EDIT`);
  const path = `/api/items/${item.id}`;
  const newCode = `${prefix}-EDITED`;
  const early = await request(path, warehouse, "PATCH", { code: ` ${newCode.toLowerCase()} `, unit: "PCS" });
  expect(early.status).toBe(200);
  expect(await early.json()).toMatchObject({ data: { code: newCode, unit: "PCS", stock: 0 } });
  await assertError(await request(path, warehouse, "PATCH", { code: `${prefix}-list-a` }), 409, "DUPLICATE_ITEM_CODE");
  await assertError(await request(path, warehouse, "PATCH", {}), 422, "VALIDATION_ERROR");
  await assertError(await request(`/api/items/${randomUUID()}`, warehouse, "PATCH", { name: "Tidak ada" }), 404, "ITEM_NOT_FOUND");

  await db.itemRequest.create({ data: requestFixture(item.id) });
  await assertError(await request(path, warehouse, "PATCH", { code: `${prefix}-BLOCKED` }), 409, "ITEM_METADATA_LOCKED");
  await assertError(await request(path, warehouse, "PATCH", { unit: "RIM" }), 409, "ITEM_METADATA_LOCKED");
  const allowed = await request(path, warehouse, "PATCH", { name: "Nama baru", location: "Rak baru", code: newCode.toLowerCase(), unit: "PCS" });
  expect(allowed.status).toBe(200);
  expect(await allowed.json()).toMatchObject({ data: { code: newCode, unit: "PCS", name: "Nama baru", location: "Rak baru", stock: 0 } });
});

it("mutasi stok mengunci kode dan satuan meski belum ada permintaan", async () => {
  const item = await createItem(`${prefix}-MOVEMENT`);
  const path = `/api/items/${item.id}`;
  await receiveFixtureStock(db, item.id, warehouse.id, 1_250);

  await assertError(await request(path, warehouse, "PATCH", { unit: "RIM" }), 409, "ITEM_METADATA_LOCKED");
  const allowed = await request(path, warehouse, "PATCH", { location: "Rak D" });
  expect(allowed.status).toBe(200);
  expect(await allowed.json()).toMatchObject({ data: { code: item.code, unit: item.unit, location: "Rak D", stock: 1_250 } });
});

async function waitForBlockedEdit(blocker: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [row] = await db.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${blocker}::int = ANY(pg_blocking_pids(pid))) AS blocked
    `;
    if (row.blocked) return true;
    await delay(80);
  }
  return false;
}

it("menunggu transaksi histori pada koneksi lain sebelum menilai edit", async () => {
  const item = await createItem(`${prefix}-LOCK-RACE`);
  const ready = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const history = db.$transaction(async (tx) => {
    await tx.itemRequest.create({ data: requestFixture(item.id) });
    const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    ready.resolve(row.pid);
    await release.promise;
  }, { timeout: 15_000 });
  void history.catch(ready.reject);

  const blocker = await ready.promise;
  const edit = request(`/api/items/${item.id}`, warehouse, "PATCH", { code: `${prefix}-RACE-INVALID` });
  let observed: boolean;
  try {
    observed = await waitForBlockedEdit(blocker);
  } finally {
    release.resolve();
  }
  const [, response] = await Promise.all([history, edit]);
  expect(observed).toBe(true);
  await assertError(response, 409, "ITEM_METADATA_LOCKED");
  expect(await db.item.findUnique({ where: { id: item.id }, select: { code: true } })).toEqual({ code: item.code });
}, 20_000);
