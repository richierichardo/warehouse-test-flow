import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { accountIdSchema, revokeSessionsSchema } from "@/modules/identity-access/admin-schema";
import { administerAccount } from "@/modules/identity-access/admin-service";

export const runtime = "nodejs";

const policy = { method: "POST", permissions: ["session:revoke"], body: revokeSessionsSchema, bucket: "admin" } as const;

export const POST = withBusinessHandler<typeof policy, { params: Promise<{ id: string }> }>(policy, async ({ context, principal, requestId }) => {
  const id = accountIdSchema.safeParse((await context.params).id);
  if (!id.success) throw new HttpError(422, "VALIDATION_ERROR", "ID akun tidak valid.");
  return { data: await administerAccount(getAuthRuntime().db, principal, id.data, requestId, { type: "revoke" }) };
});
