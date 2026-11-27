import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { requestUuidSchema } from "@/modules/requisitions/schema";
import { getRequest } from "@/modules/requisitions/service";

export const runtime = "nodejs";

const policy = { method: "GET", permissions: ["request:read-own", "request:read-all"] } as const;

export const GET = withBusinessHandler<typeof policy, { params: Promise<{ id: string }> }>(policy, async ({ context, principal }) => {
  const id = requestUuidSchema.safeParse((await context.params).id);
  if (!id.success) throw new HttpError(422, "VALIDATION_ERROR", "ID permintaan tidak valid.");
  const data = await getRequest(getAuthRuntime().db, principal, id.data);
  if (!data) throw new HttpError(404, "REQUEST_NOT_FOUND", "Permintaan tidak ditemukan.");
  return { data };
});
