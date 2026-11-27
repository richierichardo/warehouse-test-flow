import { notFound, redirect } from "next/navigation";
import { CatalogItemForm } from "@/components/catalog-item-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getCatalogItemForEdit } from "@/modules/catalog/service";
import { itemIdSchema } from "@/modules/catalog/schema";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "catalog:write")) redirect("/akses-ditolak");

  const id = itemIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const record = await getCatalogItemForEdit(getAuthRuntime().db, principal, id.data);
  if (!record) notFound();

  return (
    <WorkspaceShell principal={principal} path="/katalog">
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Edit barang</h1>
        <CatalogItemForm item={record.item} metadataLocked={record.metadataLocked} />
      </div>
    </WorkspaceShell>
  );
}
