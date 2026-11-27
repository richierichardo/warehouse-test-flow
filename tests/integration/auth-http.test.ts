import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { userRoles } from "../../src/lib/auth-options";
import { createDb } from "../../src/lib/db";
import { testDatabaseUrl } from "./database";

vi.mock("server-only", () => ({}));

const origin = "https://warehouse.example.test";
const signInPath = "/api/auth/sign-in/email";
const signOutPath = "/api/auth/sign-out";
const sessionPath = "/api/auth/get-session";
const authSecret = randomBytes(32).toString("hex");
const proxySecret = randomBytes(32).toString("hex");
const rateSecret = randomBytes(32).toString("hex");
const password = ` ${randomBytes(24).toString("hex")} `;
const roles = [...userRoles, "INACTIVE"] as const;
const users = roles.map((role, index) => ({
  id: randomUUID(),
  email: `${randomUUID()}@example.test`,
  name: `Akun Tes ${role}`,
  role,
  ip: `198.51.100.${10 + index}`,
}));
const bucketIdentities = new Set(["shared"]);
const runningApps = new Set<Awaited<ReturnType<typeof startApp>>>();

let db: ReturnType<typeof createDb>;
let databaseUrl: string;
let primary: Awaited<ReturnType<typeof startApp>>;

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("Port tes tidak tersedia.");
  return address.port;
}

async function startApp(overrides: Record<string, string> = {}) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: authSecret,
      RATE_LIMIT_KEY_SECRET: rateSecret,
      TRUSTED_PROXY_MODE: "nginx",
      TRUSTED_PROXY_SECRET: proxySecret,
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let logs = "";
  const appendLog = (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-32_768); };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);
  let spawnFailed = false;
  child.on("error", () => { spawnFailed = true; });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const app = {
    request(path: string, init?: RequestInit) {
      return fetch(`${baseUrl}${path}`, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...init });
    },
    logs: () => logs,
    async stop() {
      if (child.exitCode === null && child.signalCode === null && !spawnFailed) child.kill();
      await closed;
    },
  };
  runningApps.add(app);

  for (let attempt = 0; attempt < 80 && child.exitCode === null && !spawnFailed; attempt += 1) {
    const response = await fetch(baseUrl, { method: "HEAD", signal: AbortSignal.timeout(700) }).catch(() => null);
    if (response?.ok) return app;
    await delay(150);
  }
  await app.stop();
  throw new Error("Next.js tes tidak tersedia. Jalankan npm run build sebelum tes integrasi.");
}

beforeAll(async () => {
  databaseUrl = testDatabaseUrl();
  db = createDb(databaseUrl);
  const hash = await hashPassword(password);
  await db.$transaction(users.map(({ id, email, name, role }) => db.user.create({ data: {
    id, email, name,
    role: role === "INACTIVE" ? "EMPLOYEE" : role,
    is_active: role !== "INACTIVE",
    accounts: { create: {
      id: randomUUID(), accountId: id, providerId: "credential", password: hash,
    } },
  } })));
  primary = await startApp();
}, 30_000);

afterAll(async () => {
  try {
    await Promise.all(Array.from(runningApps, (app) => app.stop()));
    if (db) {
      const keys = Array.from(bucketIdentities).flatMap((ip) => ["auth", "login"].map((bucket) =>
        createHmac("sha256", rateSecret).update(`${bucket}\0${ip}`).digest("hex")));
      await db.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
      await db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } });
    }
  } finally {
    await db?.$disconnect();
  }
});

function proxyHeaders(ip: string, normalized = ip) {
  bucketIdentities.add(normalized);
  return { "x-warehouse-client-ip": ip, "x-warehouse-proxy-token": proxySecret };
}

function post(body?: object, extra: Record<string, string> = {}): RequestInit {
  return { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) };
}

function sessionCookie(response: Response) {
  const cookie = response.headers.getSetCookie().find((header) => header.startsWith("__Secure-better-auth.session_token="));
  if (!cookie) throw new Error(`Cookie session tidak tersedia (status ${response.status}).`);
  return { header: cookie, pair: cookie.split(";", 1)[0] };
}

function noStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

it.each(users.filter(({ role }) => role !== "INACTIVE"))("login dan logout $role dengan session delapan jam", async (user) => {
  const ip = user.role === "EMPLOYEE" ? proxyHeaders("::ffff:c000:201", "192.0.2.1") : proxyHeaders(user.ip);
  const login = await primary.request(signInPath, post({ email: user.email.toUpperCase(), password }, ip));
  expect(login.status).toBe(200);
  noStore(login);
  expect(await login.json()).toEqual({ redirect: false, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  const cookie = sessionCookie(login);
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=28800"]) {
    expect(cookie.header.includes(attribute)).toBe(true);
  }
  expect(cookie.header.includes("Domain=")).toBe(false);
  expect(login.headers.getSetCookie().some((header) => header.includes("session_data="))).toBe(false);

  const stored = await db.session.findFirstOrThrow({ where: { userId: user.id }, select: {
    id: true, ipAddress: true, expiresAt: true, createdAt: true,
  } });
  expect(stored.ipAddress).toBe(user.role === "EMPLOYEE" ? "192.0.2.1" : user.ip);
  expect(Math.abs(stored.expiresAt.getTime() - stored.createdAt.getTime() - 28_800_000)).toBeLessThan(100);
  const headers = { ...ip, Cookie: cookie.pair };
  const get = await primary.request(sessionPath, { headers });
  noStore(get);
  expect(await get.json()).toEqual({ session: { expiresAt: stored.expiresAt.toISOString() }, user: { id: user.id, email: user.email, name: user.name, role: user.role } });

  const logout = await primary.request(signOutPath, { method: "POST", headers: { ...headers, Origin: origin } });
  expect(logout.status).toBe(200);
  noStore(logout);
  expect(await logout.json()).toEqual({ success: true });
  expect(sessionCookie(logout).header.includes("Max-Age=0")).toBe(true);
  expect(await db.session.count({ where: { id: stored.id } })).toBe(0);
  expect(await (await primary.request(sessionPath, { headers })).json()).toBeNull();
});

it("membaca role terbaru dan menolak session nonaktif, expired, serta dicabut", async () => {
  const user = users[0];
  const ip = proxyHeaders("198.51.100.21");
  const issueSession = async () => {
    const response = await primary.request(signInPath, post({ email: user.email, password }, ip));
    expect(response.status).toBe(200);
    return { ...ip, Cookie: sessionCookie(response).pair };
  };
  const headers = await issueSession();
  const read = async () => await (await primary.request(sessionPath, { headers })).json();
  const issued = await db.session.findFirstOrThrow({ where: { userId: user.id }, select: { id: true } });
  try {
    await db.user.update({ where: { id: user.id }, data: { role: "WAREHOUSE" } });
    expect(await read()).toMatchObject({ user: { role: "WAREHOUSE" } });

    await db.user.update({ where: { id: user.id }, data: { is_active: false } });
    expect(await read()).toBeNull();

    await db.user.update({ where: { id: user.id }, data: { is_active: true } });
    const expiresAt = new Date(Date.now() + 60_000);
    await db.session.update({ where: { id: issued.id }, data: { expiresAt, updatedAt: new Date(Date.now() - 2 * 86_400_000) } });
    expect(await read()).toMatchObject({ session: { expiresAt: expiresAt.toISOString() } });
    expect(await db.session.findUnique({ where: { id: issued.id }, select: { expiresAt: true } })).toEqual({ expiresAt });

    await db.session.update({ where: { id: issued.id }, data: { expiresAt: new Date(Date.now() - 30_000) } });
    expect(await read()).toBeNull();
    expect(await db.session.count({ where: { id: issued.id } })).toBe(1);
    await db.session.delete({ where: { id: issued.id } });

    const revokedHeaders = await issueSession();
    await db.session.deleteMany({ where: { userId: user.id } });
    expect(await (await primary.request(sessionPath, { headers: revokedHeaders })).json()).toBeNull();
  } finally {
    await db.user.update({ where: { id: user.id }, data: { role: "EMPLOYEE", is_active: true } });
  }
});

it("menyamakan penolakan email tak terdaftar, password salah, dan akun nonaktif", async () => {
  const inactive = users.find(({ role }) => role === "INACTIVE");
  if (!inactive) throw new Error("Fixture akun nonaktif tidak tersedia.");
  const credentials = [
    { email: `${randomUUID()}@example.test`, password },
    { email: users[0].email, password: randomBytes(20).toString("hex") },
    { email: inactive.email, password },
  ];
  for (const body of credentials) {
    const response = await primary.request(signInPath, post(body, proxyHeaders(inactive.ip)));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Email atau password salah." });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  }
  expect(await db.session.count({ where: { userId: inactive.id } })).toBe(0);
});

it("menutup endpoint, metode, origin, dan body auth di luar kontrak", async () => {
  for (const path of ["/sign-up/email", "/update-user", "/change-password", "/revoke-session"]) {
    const result = await primary.request(`/api/auth${path}`, post({ email: users[0].email, password, role: "SUPERADMIN" }));
    expect(result.status).toBe(404);
    noStore(result);
  }
  for (const [path, method] of [[signOutPath, "GET"], [signInPath, "OPTIONS"], [sessionPath, "HEAD"]]) {
    expect((await primary.request(path, { method })).status).toBe(405);
  }

  for (const rejectedOrigin of [null, "null", "https://other.example.test"]) {
    const init = post({ email: users[0].email, password });
    const headers = new Headers(init.headers);
    if (rejectedOrigin === null) headers.delete("origin");
    else headers.set("origin", rejectedOrigin);
    headers.set("x-forwarded-host", "warehouse.example.test");
    expect((await primary.request(signInPath, { ...init, headers })).status).toBe(403);
  }

  const ip = proxyHeaders("198.51.100.31");
  for (const extra of [{ role: "SUPERADMIN", is_active: true }, { callbackURL: "https://other.example.test" }, { rememberMe: false }]) {
    expect((await primary.request(signInPath, post({ email: users[0].email, password, ...extra }, ip))).status).toBe(422);
  }
  expect((await primary.request(`${signInPath}?callbackURL=https://other.example.test`, post({ email: users[0].email, password }, ip))).status).toBe(422);
  expect((await primary.request(signInPath, post({ email: users[0].email, password }, { ...ip, "Content-Type": "text/plain" }))).status).toBe(415);
  expect((await primary.request(signInPath, post({ email: users[0].email, password: "x".repeat(32 * 1024) }, ip))).status).toBe(413);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(16 * 1024));
      controller.enqueue(new Uint8Array(17 * 1024));
      controller.close();
    },
  });
  const streaming: RequestInit & { duplex: "half" } = { ...post(undefined, ip), body: stream, duplex: "half" };
  expect((await primary.request(signInPath, streaming)).status).toBe(413);
  expect(await db.session.count({ where: { userId: users[0].id } })).toBe(0);
  expect(await db.user.findUnique({ where: { id: users[0].id }, select: { role: true } })).toEqual({ role: "EMPLOYEE" });
  expect(primary.logs().includes(password.trim())).toBe(false);
  expect(primary.logs().includes(proxySecret)).toBe(false);
});

async function secondsInWindow() {
  const [clock] = await db.$queryRaw<Array<{ elapsed: number }>>`
    SELECT extract(epoch FROM statement_timestamp() - date_trunc('minute', statement_timestamp()))::float8 AS elapsed
  `;
  if (!clock) throw new Error("Jam database tes tidak tersedia.");
  return clock.elapsed;
}

async function ensureTimeInWindow(minSeconds: number) {
  const left = 60 - await secondsInWindow();
  if (left < minSeconds) await delay((left + 0.2) * 1_000);
}

it("menerapkan kuota login bersama lintas proses, restart, dan spoofed IP", async () => {
  const direct = { TRUSTED_PROXY_MODE: "direct" };
  const second = await startApp(direct);
  await ensureTimeInWindow(12);
  const attempts = await Promise.all(Array.from({ length: 14 }, (_, index) => {
    const app = index % 2 ? primary : second;
    return app.request(signInPath, post({}, {
      "x-forwarded-for": `203.0.113.${index + 1}`,
      "x-warehouse-verified-ip": `203.0.113.${index + 1}`,
      "x-warehouse-client-ip": `203.0.113.${index + 1}`,
      "x-warehouse-proxy-token": "f".repeat(64),
    }));
  }));
  const blocked = attempts.filter(({ status }) => status === 429);
  expect(attempts.filter(({ status }) => status === 422)).toHaveLength(10);
  expect(blocked).toHaveLength(4);
  for (const response of blocked) {
    const retryAfter = Number(response.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    noStore(response);
  }
  await Promise.all(attempts.map((response) => response.body?.cancel()));

  await second.stop();
  const restarted = await startApp(direct);
  const limited = await restarted.request(signInPath, post({}, {
    "x-warehouse-proxy-token": proxySecret,
    "x-warehouse-client-ip": "203.0.113.200",
  }));
  expect(limited.status).toBe(429);

  const validProxy = await primary.request(signInPath, post({}, proxyHeaders("203.0.113.201")));
  expect(validProxy.status).toBe(422);
  await delay((60.25 - await secondsInWindow()) * 1_000);
  expect((await restarted.request(signInPath, post({}))).status).toBe(422);
}, 100_000);

it("menerapkan 120 request auth per window secara terpisah dari login", async () => {
  const headers = proxyHeaders("198.51.100.41");
  await ensureTimeInWindow(5);
  const responses = [];
  for (let offset = 0; offset < 124; offset += 20) {
    responses.push(...await Promise.all(Array.from({ length: Math.min(20, 124 - offset) }, () => primary.request(sessionPath, { headers }))));
  }
  expect(responses.filter(({ status }) => status === 200)).toHaveLength(120);
  expect(responses.filter(({ status }) => status === 429)).toHaveLength(4);
  await Promise.all(responses.map((response) => response.body?.cancel()));
  expect((await primary.request(signInPath, post({}, headers))).status).toBe(422);
}, 25_000);

it("mengembalikan 503 yang aman saat penyimpanan limiter tidak tersedia", async () => {
  const app = await startApp({ DATABASE_URL: "postgresql://warehouse@127.0.0.1:1/warehouse_test_unavailable" });
  const response = await app.request(signInPath, post({ email: users[0].email, password }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "AUTH_UNAVAILABLE", message: "Layanan autentikasi sementara tidak tersedia." });
  noStore(response);
  expect(response.headers.getSetCookie()).toHaveLength(0);
  expect(app.logs().includes("postgresql://")).toBe(false);
  expect(app.logs().includes(password.trim())).toBe(false);
  await app.stop();
}, 25_000);
