import { redirect } from "next/navigation";
import { RequestForm } from "@/components/request-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { hasPermission } from "@/lib/permissions";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";

export default async function NewRequestPage() {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "request:create")) redirect("/akses-ditolak");

  return (
    <WorkspaceShell principal={principal} path="/permintaan">
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Buat permintaan</h1>
        <RequestForm />
      </div>
    </WorkspaceShell>
  );
}
