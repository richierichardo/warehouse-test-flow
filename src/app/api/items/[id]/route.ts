import { getAuthRuntime } from "@/lib/auth";
import { withBusinessHandler } from "@/lib/business-handler";
import { HttpError } from "@/lib/http";
import { updateCatalogItem } from "@/modules/catalog/service";
import { itemIdSchema, updateItemSchema } from "@/modules/catalog/schema";

export const runtime = "nodejs";

const policy = { method: "PATCH", permissions: ["catalog:write"], body: updateItemSchema } as const;

export const PATCH = withBusinessHandler<typeof policy, { params: Promise<{ id: string }> }>(policy, async ({ context, principal, body }) => {
  const id = itemIdSchema.safeParse((await context.params).id);
  if (!id.success) throw new HttpError(422, "VALIDATION_ERROR", "ID barang tidak valid.");
  return { data: await updateCatalogItem(getAuthRuntime().db, principal, id.data, body) };
});
