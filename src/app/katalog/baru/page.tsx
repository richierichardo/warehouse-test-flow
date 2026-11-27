import { redirect } from "next/navigation";
import { CatalogItemForm } from "@/components/catalog-item-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { hasPermission } from "@/lib/permissions";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";

export default async function NewItemPage() {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "catalog:write")) redirect("/akses-ditolak");

  return (
    <WorkspaceShell principal={principal} path="/katalog">
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tambah barang</h1>
        <CatalogItemForm />
      </div>
    </WorkspaceShell>
  );
}
