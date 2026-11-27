import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { accountAccessSchema, accountIdSchema } from "@/modules/identity-access/admin-schema";
import { administerAccount } from "@/modules/identity-access/admin-service";

export const runtime = "nodejs";

const policy = { method: "PATCH", permissions: ["user:update-access"], body: accountAccessSchema, bucket: "admin" } as const;

export const PATCH = withBusinessHandler<typeof policy, { params: Promise<{ id: string }> }>(policy, async ({ context, principal, body, requestId }) => {
  const id = accountIdSchema.safeParse((await context.params).id);
  if (!id.success) throw new HttpError(422, "VALIDATION_ERROR", "ID akun tidak valid.");
  return { data: await administerAccount(getAuthRuntime().db, principal, id.data, requestId, { type: "update", access: body }) };
});
