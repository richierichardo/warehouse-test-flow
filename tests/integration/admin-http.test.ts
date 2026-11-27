import { execFile } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
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
const authSecret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const users = (["SUPERADMIN", "SUPERADMIN", "WAREHOUSE", "EMPLOYEE"] as const).map((role, index) => ({
  id: `fixture-${randomUUID()}`, email: `${randomUUID()}@example.test`, name: `Fixture ${role} ${index + 1}`, role,
}));
const [admin, otherAdmin, warehouse, employee] = users;
type App = Awaited<ReturnType<typeof startNextTestApp>>;
type User = (typeof users)[number];
let db: ReturnType<typeof createDb>;
let app: App;
let second: App;
let itemId: string;
const cookies = new Map<string, string>();
const exec = promisify(execFile);
const hashKey = (bucket: string, identity: string) => createHmac("sha256", limiterSecret).update(`${bucket}\0${identity}`).digest("hex");
const accessPath = (id: string) => `/api/admin/users/${id}/access`;
const revokePath = (id: string) => `/api/admin/users/${id}/revoke-sessions`;

function serve() {
  return startNextTestApp({ DATABASE_URL: testDatabaseUrl(), APP_ORIGIN: origin, BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: authSecret, RATE_LIMIT_KEY_SECRET: limiterSecret, TRUSTED_PROXY_MODE: "direct" });
}

function request(path: string, cookie?: string, options: { method?: string; body?: unknown; origin?: string | null; target?: App } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    if (options.origin !== null) headers.set("Origin", options.origin ?? origin);
  }
  return (options.target ?? app).request(path, { method: options.method ?? "GET", headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body) });
}

function change(actor: User, target: User, body: unknown, upstream = app) {
  return request(accessPath(target.id), cookies.get(actor.id), { method: "PATCH", body, target: upstream });
}

async function login(user: User) {
  const response = await request("/api/auth/sign-in/email", undefined, { method: "POST", body: { email: user.email, password } });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().find((header) => header.startsWith("__Secure-better-auth.session_token="));
  if (!cookie) throw new Error("Cookie session fixture tidak tersedia.");
  await response.body?.cancel();
  return cookie.split(";", 1)[0];
}

async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ error: { code }, requestId: expect.any(String) });
}

function auditFor(target: User) {
  return db.accessAudit.findMany({ where: { targetId: target.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const hash = await hashPassword(password);
  await db.$transaction(users.map((user) => db.user.create({ data: { ...user, accounts: { create: {
    id: randomUUID(), accountId: user.id, providerId: "credential", password: hash,
  } } } })));
  const item = await db.item.create({ data: { code: `ADMIN-${randomBytes(6).toString("hex").toUpperCase()}`, name: "Bukti persistensi", unit: "PCS", location: "Rak A", createdById: warehouse.id } });
  itemId = item.id;
  app = await serve();
  second = await serve();
  for (const user of users) cookies.set(user.id, await login(user));
}, 40_000);

afterAll(async () => {
  await Promise.all([app?.stop(), second?.stop()]);
  if (!db) return;
  try {
    const ids = users.map(({ id }) => id);
    await deleteCatalogFixtures(db, warehouse.id);
    await db.accessAudit.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const keys = [hashKey("auth", "shared"), hashKey("login", "shared"), ...ids.flatMap((id) => ["read", "write", "admin"].map((bucket) => hashKey(bucket, id)))];
    await db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } });
  } finally {
    await db.$disconnect();
  }
});

it("melindungi admin dan transaksi operasional dengan izin, origin, metode, dan schema", async () => {
  const session = cookies.get(admin.id);
  await error(await request("/api/admin/users"), 401, "UNAUTHENTICATED");
  for (const user of [employee, warehouse]) {
    await error(await request("/api/admin/users", cookies.get(user.id)), 403, "FORBIDDEN");
    await error(await change(user, employee, { isActive: false }), 403, "FORBIDDEN");
    await error(await request(revokePath(employee.id), cookies.get(user.id), { method: "POST", body: {} }), 403, "FORBIDDEN");
  }
  const list = await request("/api/admin/users?limit=100", session);
  expect(list.status).toBe(200);
  expect(list.headers.get("cache-control")).toBe("private, no-store");
  const account = (await list.json()).data.find((entry: { id: string }) => entry.id === employee.id);
  expect(account).toEqual({ id: employee.id, email: employee.email, name: employee.name, role: "EMPLOYEE", isActive: true });
  await error(await request("/api/admin/users?page=1&page=2", session), 422, "VALIDATION_ERROR");
  for (const value of [null, "null", "https://other.example.test"]) {
    await error(await request(accessPath(employee.id), session, { method: "PATCH", body: { isActive: false }, origin: value }), 403, "INVALID_ORIGIN");
  }
  expect((await request(accessPath(employee.id), session)).status).toBe(405);
  await error(await change(admin, employee, { role: "x".repeat(33_000) }), 413, "BODY_TOO_LARGE");
  for (const body of [{}, { role: "ADMIN" }, { isActive: "false" }, { isActive: false, actorId: otherAdmin.id }]) {
    await error(await change(admin, employee, body), 422, "VALIDATION_ERROR");
  }
  await error(await change(admin, admin, { isActive: false }), 403, "SELF_ACCESS");
  await error(await request(revokePath(admin.id), session, { method: "POST", body: {} }), 403, "SELF_ACCESS");
  await error(await request(accessPath("missing-account"), session, { method: "PATCH", body: { isActive: false } }), 404, "USER_NOT_FOUND");

  for (const [path, method] of [["/api/receipts", "POST"], [`/api/items/${itemId}`, "PATCH"], [`/api/requests/${randomUUID()}/approve`, "POST"]]) {
    await error(await request(path, session, { method, body: {} }), 403, "FORBIDDEN");
  }
  expect(await auditFor(employee)).toEqual([]);
  expect(await db.user.findUniqueOrThrow({ where: { id: employee.id }, select: { is_active: true } })).toEqual({ is_active: true });
}, 20_000);

it("revokes every session on access change, restores login with the latest role, and audits manual revoke", async () => {
  const old = cookies.get(employee.id);
  const another = await login(employee);
  const changed = await change(admin, employee, { role: "WAREHOUSE" });
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({ data: { user: { role: "WAREHOUSE", isActive: true }, revokedSessions: 2 } });
  for (const cookie of [old, another]) await error(await request("/api/items", cookie), 401, "UNAUTHENTICATED");
  const current = await login(employee);
  const session = await request("/api/auth/get-session", current);
  expect(await session.json()).toMatchObject({ user: { id: employee.id, role: "WAREHOUSE" } });
  const same = await change(admin, employee, { role: "WAREHOUSE", isActive: true });
  expect(await same.json()).toMatchObject({ data: { revokedSessions: 0 } });
  expect(await auditFor(employee)).toHaveLength(1);
  expect((await request("/api/items", current)).status).toBe(200);

  const revoked = await request(revokePath(employee.id), cookies.get(admin.id), { method: "POST", body: {} });
  expect(revoked.status).toBe(200);
  expect(await revoked.json()).toMatchObject({ data: { revokedSessions: 1 } });
  await error(await request("/api/items", current), 401, "UNAUTHENTICATED");
  const disable = await change(admin, employee, { isActive: false });
  expect(disable.status).toBe(200);
  const denied = await request("/api/auth/sign-in/email", undefined, { method: "POST", body: { email: employee.email, password } });
  expect(denied.status).toBe(401);
  expect(denied.headers.getSetCookie()).toHaveLength(0);
  const audits = await auditFor(employee);
  expect(audits).toMatchObject([
    { action: "ACCESS_UPDATED", actorId: admin.id, beforeSafe: { role: "EMPLOYEE", isActive: true }, afterSafe: { role: "WAREHOUSE", isActive: true } },
    { action: "SESSIONS_REVOKED", actorId: admin.id, beforeSafe: { sessionCount: 1 }, afterSafe: { sessionCount: 0 } },
    { action: "ACCESS_UPDATED", actorId: admin.id, beforeSafe: { role: "WAREHOUSE", isActive: true }, afterSafe: { role: "WAREHOUSE", isActive: false } },
  ]);
  expect(new Set(audits.map((entry) => entry.correlationId)).size).toBe(3);
}, 15_000);

it("rolls back the access update and session deletion when audit insertion fails", async () => {
  await db.$executeRaw`CREATE FUNCTION test_stage09_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM session WHERE user_id = NEW.target_id)
        AND EXISTS (SELECT 1 FROM "user" WHERE id = NEW.target_id AND NOT is_active) THEN
        RAISE EXCEPTION 'fixture failure after the access and session writes';
      END IF;
      RETURN NEW;
    END;
  $$`;
  try {
    await db.$executeRaw`CREATE TRIGGER test_stage09_audit_failure BEFORE INSERT ON access_audit FOR EACH ROW EXECUTE FUNCTION test_stage09_audit_failure()`;
    await error(await change(otherAdmin, warehouse, { isActive: false }), 503, "SERVICE_UNAVAILABLE");
    expect((await db.user.findUniqueOrThrow({ where: { id: warehouse.id } })).is_active).toBe(true);
    expect(await db.session.count({ where: { userId: warehouse.id } })).toBe(1);
    expect(await auditFor(warehouse)).toEqual([]);
    expect((await request("/api/items", cookies.get(warehouse.id))).status).toBe(200);
  } finally {
    await db.$executeRaw`DROP TRIGGER IF EXISTS test_stage09_audit_failure ON access_audit`;
    await db.$executeRaw`DROP FUNCTION IF EXISTS test_stage09_audit_failure()`;
  }
});

it("gagal secara aman saat penyimpanan limiter gagal dan mempertahankan data setelah restart", async () => {
  await db.$executeRaw`CREATE FUNCTION test_stage09_limiter_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture rate limit storage failure'; END;
  $$`;
  try {
    await db.$executeRaw`CREATE TRIGGER test_stage09_limiter_failure BEFORE INSERT OR UPDATE ON rate_limit_bucket FOR EACH ROW EXECUTE FUNCTION test_stage09_limiter_failure()`;
    await error(await change(otherAdmin, warehouse, { role: "EMPLOYEE" }), 503, "SERVICE_UNAVAILABLE");
    const auth = await request("/api/auth/sign-in/email", undefined, { method: "POST", body: { email: warehouse.email, password } });
    expect(auth.status).toBe(503);
    expect(auth.headers.getSetCookie()).toHaveLength(0);
    expect(await db.session.count({ where: { userId: warehouse.id } })).toBe(1);
    expect(await auditFor(warehouse)).toEqual([]);
    expect((await db.user.findUniqueOrThrow({ where: { id: warehouse.id } })).role).toBe("WAREHOUSE");
  } finally {
    await db.$executeRaw`DROP TRIGGER IF EXISTS test_stage09_limiter_failure ON rate_limit_bucket`;
    await db.$executeRaw`DROP FUNCTION IF EXISTS test_stage09_limiter_failure()`;
  }
  await second.stop();
  second = await serve();
  const response = await request("/api/items?q=Bukti+persistensi", cookies.get(warehouse.id), { target: second });
  expect(await response.json()).toMatchObject({ data: [{ id: itemId, stock: 0 }] });
}, 15_000);

it("mempertahankan satu superadmin aktif saat dua proses saling menonaktifkan", async () => {
  const release = await holdLock(db, (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(90409, 1)`);
  const results = Promise.all([change(admin, otherAdmin, { isActive: false }), change(otherAdmin, admin, { isActive: false }, second)]);
  let blocked: boolean;
  try {
    blocked = await blockedQueries(db, "%SELECT pg_advisory_xact_lock(90409, 1)%", 2);
  } finally {
    await release();
  }
  const [first, secondResult] = await results;
  expect(blocked).toBe(true);
  expect([first.status, secondResult.status].sort()).toEqual([200, 403]);
  await error(first.ok ? secondResult : first, 403, "FORBIDDEN");
  const winner = first.ok ? admin : otherAdmin;
  const loser = first.ok ? otherAdmin : admin;
  expect(await db.user.count({ where: { id: { in: [admin.id, otherAdmin.id] }, role: "SUPERADMIN", is_active: true } })).toBe(1);
  expect(await auditFor(loser)).toMatchObject([{ actorId: winner.id, targetId: loser.id, action: "ACCESS_UPDATED" }]);
  await error(await request("/api/admin/users", cookies.get(loser.id)), 401, "UNAUTHENTICATED");
}, 15_000);

it("membersihkan bucket kedaluwarsa melalui CLI dengan hasil idempoten", async () => {
  const expired = randomBytes(32).toString("hex");
  const live = randomBytes(32).toString("hex");
  await db.$executeRaw`INSERT INTO rate_limit_bucket (key_hash, window_start, count, expires_at) VALUES
    (${expired}, statement_timestamp() - interval '2 minutes', 1, statement_timestamp() - interval '1 minute'),
    (${live}, statement_timestamp(), 1, statement_timestamp() + interval '10 minutes')`;
  const cli = () => exec(process.execPath, ["--conditions=react-server", "scripts/limiter-cleanup.ts"], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() }, timeout: 10_000, windowsHide: true,
  });
  try {
    expect((await cli()).stdout).toMatch(/\d+ bucket kedaluwarsa dihapus/);
    expect(await db.rateLimitBucket.count({ where: { keyHash: expired } })).toBe(0);
    expect(await db.rateLimitBucket.count({ where: { keyHash: live } })).toBe(1);
    expect((await cli()).stdout).toMatch(/\d+ bucket kedaluwarsa dihapus/);
    expect(await db.rateLimitBucket.count({ where: { keyHash: expired } })).toBe(0);
    expect(await db.rateLimitBucket.count({ where: { keyHash: live } })).toBe(1);
  } finally {
    await db.rateLimitBucket.deleteMany({ where: { keyHash: { in: [expired, live] } } });
  }
}, 16_000);
