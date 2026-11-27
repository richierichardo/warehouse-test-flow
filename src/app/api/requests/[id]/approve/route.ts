import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { approveRequestSchema, requestUuidSchema } from "@/modules/requisitions/schema";
import { decideRequest } from "@/modules/requisitions/service";

export const runtime = "nodejs";

const policy = { method: "POST", body: approveRequestSchema, permissions: ["request:decide"], bucket: "decision" } as const;

export const POST = withBusinessHandler<typeof policy, { params: Promise<{ id: string }> }>(policy, async ({ principal, context }) => {
  const id = requestUuidSchema.safeParse((await context.params).id);
  if (!id.success) throw new HttpError(422, "VALIDATION_ERROR", "ID permintaan tidak valid.");
  return { data: await decideRequest(getAuthRuntime().db, principal, id.data, { status: "APPROVED" }) };
});
