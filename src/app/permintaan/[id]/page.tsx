import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { secondaryClass } from "@/components/operations-styles";
import { RequestStatusLabel } from "@/components/request-status";
import { PostingDate, warehouseNumber } from "@/components/stock-history";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";
import { requestUuidSchema } from "@/modules/requisitions/schema";
import { getRequest } from "@/modules/requisitions/service";

export default async function RequestDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requireWorkspacePrincipal();
  if (!hasAnyPermission(principal.role, ["request:read-own", "request:read-all"])) redirect("/akses-ditolak");
  const id = requestUuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const entry = await getRequest(getAuthRuntime().db, principal, id.data);
  if (!entry) notFound();

  return (
    <WorkspaceShell principal={principal} path="/permintaan">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Detail permintaan</h1>
        <section className="space-y-4 rounded-lg border bg-card p-5 sm:p-8" aria-label="Data permintaan">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="min-w-0 font-semibold wrap-anywhere">{entry.requestNo}</h2>
            <RequestStatusLabel status={entry.status} />
          </div>
          <dl className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Barang</dt><dd className="wrap-anywhere">{entry.item.code} · {entry.item.name}</dd></div>
            <div><dt className="text-muted-foreground">Jumlah</dt><dd>{warehouseNumber.format(entry.quantity)} {entry.item.unit}</dd></div>
            <div><dt className="text-muted-foreground">Diajukan</dt><dd><PostingDate value={entry.createdAt} /></dd></div>
            {entry.requester && <div><dt className="text-muted-foreground">Pemohon</dt><dd className="wrap-anywhere">{entry.requester.name}</dd></div>}
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Catatan</dt><dd className="wrap-anywhere whitespace-pre-wrap">{entry.notes ?? "–"}</dd></div>
            {entry.decidedAt && <div><dt className="text-muted-foreground">Waktu keputusan</dt><dd><PostingDate value={entry.decidedAt} /></dd></div>}
            {entry.decidedBy && <div><dt className="text-muted-foreground">Petugas</dt><dd className="wrap-anywhere">{entry.decidedBy.name}</dd></div>}
            {entry.rejectionReason && <div className="sm:col-span-2"><dt className="text-muted-foreground">Alasan ditolak</dt><dd className="wrap-anywhere whitespace-pre-wrap">{entry.rejectionReason}</dd></div>}
          </dl>
        </section>
        <Link href="/permintaan" prefetch={false} className={secondaryClass}>Kembali ke permintaan</Link>
      </div>
    </WorkspaceShell>
  );
}
