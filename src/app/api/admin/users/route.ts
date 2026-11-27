import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { parseAdminQuery } from "@/modules/identity-access/admin-schema";
import { listAdminAccounts } from "@/modules/identity-access/admin-service";

export const runtime = "nodejs";

export const GET = withBusinessHandler({ method: "GET", permissions: ["user:read"] }, async ({ request, principal }) => {
  const query = parseAdminQuery(new URL(request.url).searchParams);
  if (!query.success) throw new HttpError(422, "VALIDATION_ERROR", "Halaman akun tidak valid.");
  return listAdminAccounts(getAuthRuntime().db, principal, query.data);
});
