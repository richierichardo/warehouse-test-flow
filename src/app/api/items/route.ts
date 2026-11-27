import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { createCatalogItem, listCatalog } from "@/modules/catalog/service";
import { createItemSchema, parseCatalogQuery } from "@/modules/catalog/schema";

export const runtime = "nodejs";

export const GET = withBusinessHandler({ method: "GET", permissions: ["catalog:read"] }, async ({ request, principal }) => {
  const query = parseCatalogQuery(new URL(request.url).searchParams);
  if (!query.success) throw new HttpError(422, "VALIDATION_ERROR", "Filter katalog tidak valid.");
  return listCatalog(getAuthRuntime().db, principal, query.data);
});

export const POST = withBusinessHandler({ method: "POST", permissions: ["catalog:write"], body: createItemSchema }, async ({ principal, body }) => ({
  data: await createCatalogItem(getAuthRuntime().db, principal, body),
  status: 201,
}));
