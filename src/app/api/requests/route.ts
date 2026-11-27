import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { createRequestSchema, parseRequestQuery, requestUuidSchema } from "@/modules/requisitions/schema";
import { listRequests, submitRequest } from "@/modules/requisitions/service";

export const runtime = "nodejs";

export const GET = withBusinessHandler({ method: "GET", permissions: ["request:read-own", "request:read-all"] }, async ({ request, principal }) => {
  const query = parseRequestQuery(new URL(request.url).searchParams);
  if (!query.success) throw new HttpError(422, "VALIDATION_ERROR", "Filter permintaan tidak valid.");
  return listRequests(getAuthRuntime().db, principal, query.data);
});

export const POST = withBusinessHandler({ method: "POST", permissions: ["request:create"], body: createRequestSchema }, async ({ request, principal, body }) => {
  const key = requestUuidSchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) throw new HttpError(422, "INVALID_IDEMPOTENCY_KEY", "Kunci pengiriman wajib berupa UUID.");
  return submitRequest(getAuthRuntime().db, principal, key.data, body);
});
