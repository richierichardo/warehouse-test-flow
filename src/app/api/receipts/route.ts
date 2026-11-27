import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { parseHistoryQuery } from "@/modules/inventory/history-query";
import { listReceipts } from "@/modules/receiving/history";
import { receiptKeySchema, receiveGoodsSchema } from "@/modules/receiving/schema";
import { receiveGoods } from "@/modules/receiving/service";

export const runtime = "nodejs";

export const GET = withBusinessHandler({ method: "GET", permissions: ["receipt:read"] }, async ({ request, principal }) => {
  const query = parseHistoryQuery(new URL(request.url).searchParams);
  if (!query.success) throw new HttpError(422, "VALIDATION_ERROR", "Filter penerimaan tidak valid.");
  return listReceipts(getAuthRuntime().db, principal, query.data);
});

export const POST = withBusinessHandler({ method: "POST", permissions: ["receipt:create"], body: receiveGoodsSchema }, async ({ request, principal, body }) => {
  const key = receiptKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) throw new HttpError(422, "INVALID_IDEMPOTENCY_KEY", "Kunci pengiriman wajib berupa UUID.");
  return receiveGoods(getAuthRuntime().db, principal, key.data, body);
});
