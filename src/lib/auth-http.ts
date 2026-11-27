import "server-only";

import { z } from "zod";
import { getAuthRuntime, invalidCredentials } from "./auth";
import { findActivePrincipal, principalSchema } from "./principal";
import { consumeAuthQuota } from "./rate-limit";
import { trustedClientIp, verifiedIpHeader } from "./trusted-ip";

const signInPath = "/api/auth/sign-in/email";
const signOutPath = "/api/auth/sign-out";
const sessionPath = "/api/auth/get-session";
const maxBodyBytes = 32 * 1024;

const signInSchema = z.strictObject({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1).max(128),
});
const signOutSchema = z.strictObject({});
const signInResult = z.object({ user: principalSchema });
const sessionResult = z.object({
  session: z.object({ expiresAt: z.iso.datetime() }),
  user: z.object({ id: z.string() }),
}).nullable();

class AuthRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function json(body: unknown, status: number, cookieSource?: Response, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "private, no-store");
  for (const cookie of cookieSource?.headers.getSetCookie() ?? []) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

function invalidBody() {
  return new AuthRequestError(422, "VALIDATION_ERROR", "Isi permintaan tidak valid.");
}

function oversizedBody() {
  return new AuthRequestError(413, "BODY_TOO_LARGE", "Ukuran permintaan melebihi 32 KiB.");
}

function unsupportedMediaType() {
  return new AuthRequestError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan Content-Type application/json.");
}

async function readJsonBody(request: Request, allowEmpty: boolean): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw oversizedBody();
  if (!request.body && allowEmpty) return {};

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const isJson = contentType === "application/json";
  if (!isJson && !allowEmpty) throw unsupportedMediaType();
  if (!request.body) throw invalidBody();

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBodyBytes) throw oversizedBody();
      if (isJson) body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof AuthRequestError) throw error;
    throw invalidBody();
  } finally {
    reader.releaseLock();
  }

  if (received === 0 && allowEmpty) return {};
  if (!isJson) throw unsupportedMediaType();
  try {
    return JSON.parse(body);
  } catch {
    throw invalidBody();
  }
}

function authHeaders(source: Headers, ip: string | null) {
  const headers = new Headers();
  for (const name of ["cookie", "origin", "referer", "user-agent", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest"]) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (ip) headers.set(verifiedIpHeader, ip);
  return headers;
}

let reportedIpFallback = false;

export async function handleAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const signIn = path === signInPath;
  const signOut = path === signOutPath;
  const session = path === sessionPath;

  if (!signIn && !signOut && !session) return json({ code: "NOT_FOUND", message: "Endpoint tidak ditemukan." }, 404);

  const method = session ? "GET" : "POST";
  if (request.method !== method) {
    return json({ code: "METHOD_NOT_ALLOWED", message: "Metode tidak diizinkan." }, 405, undefined, { Allow: method });
  }

  try {
    const { auth, db, env } = getAuthRuntime();
    if (method === "POST" && request.headers.get("origin") !== env.APP_ORIGIN) {
      throw new AuthRequestError(403, "INVALID_ORIGIN", "Origin permintaan tidak diizinkan.");
    }

    const ip = trustedClientIp(request.headers, env);
    if (!ip && !reportedIpFallback) {
      reportedIpFallback = true;
      console.warn(`[warehouse-auth] Menggunakan bucket bersama untuk mode ${env.TRUSTED_PROXY_MODE}.`);
    }
    const quota = await consumeAuthQuota(db, env.RATE_LIMIT_KEY_SECRET, signIn ? "login" : "auth", ip);
    if (!quota.allowed) {
      return json({ code: "RATE_LIMITED", message: "Terlalu banyak percobaan. Coba lagi setelah waktu tunggu." }, 429,
        undefined, { "Retry-After": String(quota.retryAfter) });
    }
    if (url.search) throw invalidBody();

    const headers = authHeaders(request.headers, ip);
    let data: string | undefined;
    if (method === "POST") {
      const body = await readJsonBody(request, signOut);
      const parsed = (signIn ? signInSchema : signOutSchema).safeParse(body);
      if (!parsed.success) throw invalidBody();
      headers.set("Content-Type", "application/json");
      data = JSON.stringify(parsed.data);
    }

    const formerSession = signOut
      ? await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } })
      : null;
    const result = await auth.handler(new Request(new URL(path, env.APP_ORIGIN), { method, headers, body: data }));

    if (result.status >= 500) throw new Error("Better Auth tidak tersedia.");
    if (result.status === 403) return json({ code: "FORBIDDEN", message: "Permintaan tidak diizinkan." }, 403);
    if (!result.ok) {
      return signIn ? json(invalidCredentials, 401)
        : json({ code: "AUTH_REQUEST_REJECTED", message: "Permintaan autentikasi ditolak." }, result.status);
    }

    if (signOut) {
      // Better Auth dapat mengembalikan sukses setelah kegagalan menghapus session.
      if (formerSession && await db.session.findUnique({ where: { id: formerSession.session.id }, select: { id: true } })) {
        throw new Error("Session masih tersimpan setelah sign-out.");
      }
      return json({ success: true }, 200, result);
    }

    const payload: unknown = await result.json();
    if (signIn) return json({ redirect: false, user: signInResult.parse(payload).user }, 200, result);

    const current = sessionResult.parse(payload);
    const principal = current ? await findActivePrincipal(db, current.user.id) : null;
    return json(current && principal ? { session: current.session, user: principal } : null, 200, result);
  } catch (error) {
    if (error instanceof AuthRequestError) return json({ code: error.code, message: error.message }, error.status);

    console.warn("[warehouse-auth] Layanan autentikasi tidak tersedia.");
    return json({ code: "AUTH_UNAVAILABLE", message: "Layanan autentikasi sementara tidak tersedia." }, 503);
  }
}
