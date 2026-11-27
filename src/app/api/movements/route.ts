import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { parseHistoryQuery } from "@/modules/inventory/history-query";
import { listIncomingMovements } from "@/modules/inventory/service";

export const runtime = "nodejs";

export const GET = withBusinessHandler({ method: "GET", permissions: ["movement:read"] }, async ({ request, principal }) => {
  const query = parseHistoryQuery(new URL(request.url).searchParams);
  if (!query.success) throw new HttpError(422, "VALIDATION_ERROR", "Filter kartu stok tidak valid.");
  return listIncomingMovements(getAuthRuntime().db, principal, query.data);
});
