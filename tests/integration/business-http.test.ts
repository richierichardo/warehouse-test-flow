import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { z } from "zod";
import { getAuthRuntime } from "../../src/lib/auth";
import { handleAuthRequest } from "../../src/lib/auth-http";
import { withBusinessHandler } from "../../src/lib/business-handler";
import { createDb } from "../../src/lib/db";
import { HttpError } from "../../src/lib/http";
import { findVisibleRequestById, listVisibleRequests } from "../../src/modules/requisitions/repository";
import { testDatabaseUrl } from "./database";

vi.mock("server-only", () => ({}));

const password = randomBytes(24).toString("hex");
const rateSecret = randomBytes(32).toString("hex");
const users = (["EMPLOYEE", "EMPLOYEE", "WAREHOUSE", "SUPERADMIN"] as const).map((role) => ({
  id: randomUUID(), email: `${randomUUID()}@example.test`, name: `Fixture ${role}`, role,
}));
const itemId = randomUUID();
const requestIds = [randomUUID(), randomUUID()];
const cookies: string[] = [];
let db: ReturnType<typeof createDb>;
let appDb: ReturnType<typeof createDb> | undefined;
let server: Server | undefined;
let origin: string;
let writesCalled = 0;

const itemBody = z.object({ name: z.string().trim().min(1) });
const createItem = withBusinessHandler({ method: "POST", permissions: ["catalog:write"], body: itemBody }, async ({ principal, body }) => {
  writesCalled += 1;
  return { status: 201, data: { actorId: principal.id, name: body.name } };
});
const createReceipt = withBusinessHandler({ method: "POST", permissions: ["receipt:create"], body: itemBody }, async () => ({ data: true }));
const decide = withBusinessHandler({ method: "POST", permissions: ["request:decide"], body: itemBody, bucket: "decision" }, async () => ({ data: true }));
const admin = withBusinessHandler({ method: "PATCH", permissions: ["user:update-access"], body: itemBody, bucket: "admin" }, async () => ({ data: true }));
const readRequests = withBusinessHandler({ method: "GET", permissions: ["request:read-all", "request:read-own"] }, async ({ request, principal }) => {
  const query = new URL(request.url).searchParams;
  const filter = query.get("requesterId");
  const id = query.get("id");
  if (!id) return { data: await listVisibleRequests(db, principal, filter ? { requesterId: filter } : {}) };

  const result = await findVisibleRequestById(db, principal, id);
  if (!result) throw new HttpError(404, "NOT_FOUND", "Permintaan tidak ditemukan.");
  return { data: result };
});
const unavailable = withBusinessHandler({ method: "GET", permissions: ["catalog:read"] }, async () => ({
  data: await db.$queryRaw`SELECT * FROM fixture_table_does_not_exist`,
}));

const handlers = new Map([
  ["/fixture/items", createItem], ["/fixture/receipts", createReceipt], ["/fixture/decisions", decide],
  ["/fixture/admin", admin], ["/fixture/requests", readRequests], ["/fixture/unavailable", unavailable],
]);

async function startHttpFixture() {
  server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? "/", origin);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const method = incoming.method ?? "GET";
      const init: RequestInit & { duplex: "half" } = { method, headers, duplex: "half" };
      if (method !== "GET" && method !== "HEAD") init.body = Readable.toWeb(incoming) as ReadableStream;
      const request = new Request(url, init);
      const response = url.pathname.startsWith("/api/auth/") ? await handleAuthRequest(request)
        : await handlers.get(url.pathname)?.(request, undefined) ?? new Response(null, { status: 404 });
      outgoing.statusCode = response.status;
      for (const [key, value] of response.headers) {
        if (key !== "set-cookie") outgoing.setHeader(key, value);
      }
      const issuedCookies = response.headers.getSetCookie();
      if (issuedCookies.length) outgoing.setHeader("Set-Cookie", issuedCookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.statusCode = 500;
      outgoing.end();
    }
  });
  const fixtureServer = server;
  await new Promise<void>((resolve, reject) => {
    fixtureServer.once("error", reject);
    fixtureServer.listen(0, "127.0.0.1", resolve);
  });
  const address = fixtureServer.address();
  if (!address || typeof address === "string") throw new Error("Alamat server fixture tidak tersedia.");
  origin = `http://127.0.0.1:${address.port}`;
}

function request(path: string, init?: RequestInit) {
  return fetch(origin + path, { signal: AbortSignal.timeout(10_000), redirect: "manual", ...init });
}

function send(path: string, cookie: string, body: unknown = { name: "  ATK  " }, method = "POST", headerOrigin: string | null = origin) {
  const headers = new Headers({ Cookie: cookie, "Content-Type": "application/json" });
  if (headerOrigin !== null) headers.set("Origin", headerOrigin);
  return request(path, { method, headers, body: JSON.stringify(body) });
}

async function login(user: (typeof users)[number]) {
  const response = await send("/api/auth/sign-in/email", "", { email: user.email, password });
  expect(response.status).toBe(200);
  await response.body?.cancel();
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("better-auth.session_token="));
  if (!cookie) throw new Error("Session fixture tidak tersedia.");
  return cookie.split(";", 1)[0];
}

function keyHash(bucket: string, id: string) {
  return createHmac("sha256", rateSecret).update(`${bucket}\0${id}`).digest("hex");
}

beforeAll(async () => {
  const url = testDatabaseUrl();
  db = createDb(url);
  await startHttpFixture();
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("RATE_LIMIT_KEY_SECRET", rateSecret);
  vi.stubEnv("TRUSTED_PROXY_MODE", "direct");
  appDb = getAuthRuntime().db;

  const hash = await hashPassword(password);
  await db.$transaction(users.map((user) => db.user.create({ data: { ...user, accounts: { create: {
    id: randomUUID(), accountId: user.id, providerId: "credential", password: hash,
  } } } })));
  await db.item.create({ data: { id: itemId, code: `TEST-${itemId.toUpperCase()}`, name: "Kertas Fixture", unit: "rim", location: "Rak", createdById: users[2].id } });
  await db.itemRequest.createMany({ data: requestIds.map((id, idx) => ({
    id, requestNo: id, itemId, quantity: 1, requesterId: users[idx].id, idempotencyKey: randomUUID(), payloadHash: "fixture",
  })) });
  for (const user of users) cookies.push(await login(user));
}, 25_000);

afterAll(async () => {
  try {
    if (server) {
      const fixtureServer = server;
      await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
    }
    if (db) {
      const actorIds = users.map(({ id }) => id);
      const keys = [keyHash("login", "shared"), ...actorIds.flatMap((id) => ["read", "write", "decision", "admin"].map((bucket) => keyHash(bucket, id)))];
      await db.$transaction([
        db.itemRequest.deleteMany({ where: { id: { in: requestIds } } }),
        db.item.deleteMany({ where: { id: itemId } }),
        db.user.deleteMany({ where: { id: { in: actorIds } } }),
        db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } }),
      ]);
    }
  } finally {
    await db?.$disconnect();
    await appDb?.$disconnect();
    vi.unstubAllEnvs();
  }
});

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const payload = await response.json();
  expect(payload).toMatchObject({ error: { code, message: expect.any(String) }, requestId: expect.any(String) });
  expect(z.uuid().safeParse(payload.requestId).success).toBe(true);
  return payload;
}

it("menolak akses HTTP langsung tanpa session atau izin yang tepat", async () => {
  await expectError(await request("/fixture/requests"), 401, "UNAUTHENTICATED");
  for (const path of ["/fixture/items", "/fixture/receipts", "/fixture/decisions"]) {
    await expectError(await send(path, cookies[0]), 403, "FORBIDDEN");
    await expectError(await send(path, cookies[3]), 403, "FORBIDDEN");
  }
  await expectError(await send("/fixture/admin", cookies[2], undefined, "PATCH"), 403, "FORBIDDEN");
  await expectError(await request("/fixture/items"), 405, "METHOD_NOT_ALLOWED");
  expect(writesCalled).toBe(0);
});

it("membatasi daftar dan detail berdasarkan pemilik di database", async () => {
  const own = await request("/fixture/requests", { headers: { Cookie: cookies[0] } });
  expect(own.status).toBe(200);
  expect((await own.json()).data.map(({ id }: { id: string }) => id)).toEqual([requestIds[0]]);
  const conflicting = await request(`/fixture/requests?requesterId=${users[1].id}`, { headers: { Cookie: cookies[0] } });
  expect(await conflicting.json()).toEqual({ data: [] });
  await expectError(await request(`/fixture/requests?id=${requestIds[1]}`, { headers: { Cookie: cookies[0] } }), 404, "NOT_FOUND");
  await expectError(await request(`/fixture/requests?id=${randomUUID()}`, { headers: { Cookie: cookies[0] } }), 404, "NOT_FOUND");

  for (const index of [2, 3]) {
    const list = await request("/fixture/requests", { headers: { Cookie: cookies[index] } });
    expect((await list.json()).data.map(({ id }: { id: string }) => id)).toEqual(expect.arrayContaining(requestIds));
    const detail = await request(`/fixture/requests?id=${requestIds[1]}`, { headers: { Cookie: cookies[index] } });
    expect(await detail.json()).toMatchObject({ data: { id: requestIds[1] } });
  }
});

it("menolak origin, field milik server, dan body yang melanggar kontrak", async () => {
  const path = "/fixture/items";
  const before = writesCalled;
  for (const suppliedOrigin of [null, "null", "https://other.example.test"]) {
    await expectError(await send(path, cookies[2], undefined, "POST", suppliedOrigin), 403, "INVALID_ORIGIN");
  }
  for (const field of [{ actor: users[3].id }, { role: "SUPERADMIN" }, { stock: 5 }]) {
    await expectError(await send(path, cookies[2], { name: "ATK", ...field }), 422, "VALIDATION_ERROR");
  }
  await expectError(await send(path, cookies[2], { name: "x".repeat(32 * 1024) }), 413, "BODY_TOO_LARGE");
  await expectError(await request(path, { method: "POST", headers: { Cookie: cookies[2], Origin: origin, "Content-Type": "text/plain" }, body: "not json" }), 415, "UNSUPPORTED_MEDIA_TYPE");
  expect(writesCalled).toBe(before);

  const allowed = await send(path, cookies[2]);
  expect(allowed.status).toBe(201);
  expect(allowed.headers.get("cache-control")).toBe("private, no-store");
  expect(await allowed.json()).toEqual({ data: { actorId: users[2].id, name: "ATK" } });
  expect(writesCalled).toBe(before + 1);
});

it("menyamarkan detail kegagalan dari PostgreSQL", async () => {
  const response = await request("/fixture/unavailable", { headers: { Cookie: cookies[0] } });
  const payload = await expectError(response, 503, "SERVICE_UNAVAILABLE");
  expect(JSON.stringify(payload)).not.toContain("fixture_table_does_not_exist");
});

async function primeRate(bucket: string, id: string, count: number) {
  await db.$executeRaw`
    INSERT INTO rate_limit_bucket (key_hash, window_start, count, expires_at)
    VALUES (${keyHash(bucket, id)}, date_trunc('minute', statement_timestamp()), ${count}, date_trunc('minute', statement_timestamp()) + interval '1 minute')
    ON CONFLICT (key_hash, window_start) DO UPDATE SET count = EXCLUDED.count
  `;
}

async function ensureWindowTime() {
  const [clock] = await db.$queryRaw<Array<{ seconds: number }>>`
    SELECT extract(epoch FROM (date_trunc('minute', statement_timestamp()) + interval '1 minute' - statement_timestamp()))::float8 AS seconds
  `;
  if (clock && clock.seconds < 7) await delay((clock.seconds + 0.2) * 1_000);
}

async function expectLimited(response: Response) {
  await expectError(response, 429, "RATE_LIMITED");
  expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  expect(Number(response.headers.get("retry-after"))).toBeLessThanOrEqual(60);
}

it("membatasi baca secara atomik per akun", async () => {
  await ensureWindowTime();
  await primeRate("read", users[0].id, 119);
  const results = await Promise.all(Array.from({ length: 2 }, () => request("/fixture/requests", { headers: { Cookie: cookies[0] } })));
  expect(results.map(({ status }) => status).sort()).toEqual([200, 429]);
  const limited = results.find(({ status }) => status === 429);
  if (limited) await expectLimited(limited);
  expect((await request("/fixture/requests", { headers: { Cookie: cookies[1] } })).status).toBe(200);
}, 15_000);

it("keputusan dan administrasi memakai bucket mutasi serta bucket khusus", async () => {
  await ensureWindowTime();
  await primeRate("write", users[2].id, 59);
  await primeRate("decision", users[2].id, 29);
  expect((await send("/fixture/decisions", cookies[2])).status).toBe(200);
  await expectLimited(await send("/fixture/receipts", cookies[2]));

  await primeRate("write", users[2].id, 0);
  await expectLimited(await send("/fixture/decisions", cookies[2]));
  expect((await send("/fixture/receipts", cookies[2])).status).toBe(200);

  await primeRate("write", users[3].id, 60);
  await primeRate("admin", users[3].id, 19);
  await expectLimited(await send("/fixture/admin", cookies[3], undefined, "PATCH"));
  await primeRate("write", users[3].id, 0);
  expect((await send("/fixture/admin", cookies[3], undefined, "PATCH")).status).toBe(200);
  await expectLimited(await send("/fixture/admin", cookies[3], undefined, "PATCH"));
}, 15_000);
