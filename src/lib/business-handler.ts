import "server-only";

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { getAuthRuntime } from "./auth";
import { HttpError, invalidBody, readJsonBody } from "./http";
import { requirePermission, type RequiredPermissions } from "./permissions";
import { PrincipalRequiredError, requirePrincipal, type Principal } from "./principal";
import { consumeBusinessQuota } from "./rate-limit";

type BusinessPolicy = { permissions: RequiredPermissions } & (
  | { method: "GET" }
  | { method: "POST" | "PATCH"; body: z.ZodObject; bucket?: "decision" | "admin" }
);

type PolicyBody<Policy> = Policy extends { body: infer Schema extends z.ZodType } ? z.output<Schema> : undefined;

type BusinessResult = { data: unknown; meta?: unknown; status?: 200 | 201 };

function json(body: unknown, status: number, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { status, headers });
}

export function withBusinessHandler<Policy extends BusinessPolicy, Context = unknown>(
  policy: Policy,
  handle: (input: { request: Request; context: Context; principal: Principal; body: PolicyBody<Policy>; requestId: string }) => Promise<BusinessResult>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    const requestId = randomUUID();
    if (request.method !== policy.method) {
      return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Metode tidak diizinkan." }, requestId }, 405, { Allow: policy.method });
    }

    try {
      const { db, env } = getAuthRuntime();
      const mutation = policy.method !== "GET";
      if (mutation && request.headers.get("origin") !== env.APP_ORIGIN) {
        throw new HttpError(403, "INVALID_ORIGIN", "Origin permintaan tidak diizinkan.");
      }

      const principal = await requirePrincipal(request.headers);
      requirePermission(principal.role, policy.permissions);

      const buckets = mutation ? ["write", policy.bucket] as const : ["read"] as const;
      for (const bucket of buckets) {
        if (!bucket) continue;
        const quota = await consumeBusinessQuota(db, env.RATE_LIMIT_KEY_SECRET, bucket, principal.id);
        if (!quota.allowed) {
          return json({ error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi setelah waktu tunggu." }, requestId },
            429, { "Retry-After": String(quota.retryAfter) });
        }
      }

      let body: unknown;
      if (mutation) {
        const parsed = await policy.body.strict().safeParseAsync(await readJsonBody(request));
        if (!parsed.success) throw invalidBody();
        body = parsed.data;
      }

      const { data, meta, status = 200 } = await handle({ request, context, principal, body: body as PolicyBody<Policy>, requestId });
      return json({ data, meta }, status);
    } catch (error) {
      if (error instanceof PrincipalRequiredError) return json({ error: { code: "UNAUTHENTICATED", message: error.message }, requestId }, 401);
      if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message }, requestId }, error.status);

      console.warn(`[warehouse-business] Layanan tidak tersedia. Referensi ${requestId}.`);
      return json({ error: { code: "SERVICE_UNAVAILABLE", message: "Layanan sementara tidak tersedia." }, requestId }, 503);
    }
  };
}
