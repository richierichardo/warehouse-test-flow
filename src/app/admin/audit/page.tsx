import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPagination } from "@/components/admin-pagination";
import { secondaryClass } from "@/components/operations-styles";
import { HistoryEntry, PostingDate, warehouseNumber } from "@/components/stock-history";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { listAccessAudit } from "@/modules/audit/access-audit";
import { parseAdminQuery } from "@/modules/identity-access/admin-schema";
import { requireWorkspacePrincipal, roleLabels } from "@/modules/identity-access/workspace";

type Snapshot = Awaited<ReturnType<typeof listAccessAudit>>["data"][number]["before"];

function snapshotLabel(snapshot: Snapshot) {
  if (!snapshot) return "–";
  if ("sessionCount" in snapshot) return `${warehouseNumber.format(snapshot.sessionCount)} sesi`;
  return `${roleLabels[snapshot.role]} · ${snapshot.isActive ? "Aktif" : "Nonaktif"}`;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "user:read")) redirect("/akses-ditolak");
  const query = parseAdminQuery(await searchParams);
  const result = query.success ? await listAccessAudit(getAuthRuntime().db, principal, query.data) : null;

  return <WorkspaceShell principal={principal} path="/admin/audit">
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Audit akses</h1>
      {result ? <>
        {result.data.length ? <ul aria-label="Riwayat akses akun" className="space-y-3">
          {result.data.map((entry) => <HistoryEntry key={entry.id} title={entry.action === "ACCESS_UPDATED" ? "Perubahan akses" : "Pencabutan sesi"}
            reference={null} fields={[["Pelaku", entry.actor.name], ["Target", entry.target.name], ["Sebelum", snapshotLabel(entry.before)],
              ["Sesudah", snapshotLabel(entry.after)], ["Waktu", <PostingDate key="time" value={entry.createdAt} />], ["ID korelasi", entry.correlationId]]} />)}
        </ul> : <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Belum ada peristiwa audit pada halaman ini.</p>}
        <AdminPagination path="/admin/audit" meta={result.meta} />
      </> : <div role="alert" className="space-y-2 rounded-lg border bg-card p-5 text-sm">
        <p>Nomor halaman tidak valid.</p><Link href="/admin/audit" className={secondaryClass}>Halaman pertama</Link>
      </div>}
    </div>
  </WorkspaceShell>;
}
