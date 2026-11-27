import { redirect } from "next/navigation";
import { ReceiptForm } from "@/components/receipt-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { hasPermission } from "@/lib/permissions";
import { todayInWib } from "@/lib/warehouse-date";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";

export default async function NewReceiptPage() {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "receipt:create")) redirect("/akses-ditolak");

  return (
    <WorkspaceShell principal={principal} path="/penerimaan">
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Catat penerimaan</h1>
        <ReceiptForm today={todayInWib()} />
      </div>
    </WorkspaceShell>
  );
}
