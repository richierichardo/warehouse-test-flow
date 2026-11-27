import { redirect } from "next/navigation";
import { DocumentDate, HistoryEntry, PostingDate, StockHistory, warehouseNumber } from "@/components/stock-history";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";
import { parseHistoryQuery } from "@/modules/inventory/history-query";
import { listReceipts } from "@/modules/receiving/history";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "receipt:read")) redirect("/akses-ditolak");
  const parsed = parseHistoryQuery(await searchParams);
  const result = parsed.success ? await listReceipts(getAuthRuntime().db, principal, parsed.data) : null;

  return (
    <WorkspaceShell principal={principal} path="/penerimaan">
      <StockHistory path="/penerimaan" title="Penerimaan" rangeLabel="Tanggal dokumen" canReceive={hasPermission(principal.role, "receipt:create")}
        listing={parsed.success && result ? { query: parsed.data, meta: result.meta, item: result.data[0]?.item, entries: result.data.map((entry) => (
          <HistoryEntry key={entry.id} title={`${entry.item.code} · ${entry.item.name}`} reference={entry.receiptNo} fields={[
            ["Jumlah", `${warehouseNumber.format(entry.quantity)} ${entry.item.unit}`],
            ["Tanggal dokumen", <DocumentDate key="receivedOn" value={entry.receivedOn} />],
            ["Waktu posting", <PostingDate key="postedAt" value={entry.postedAt} />],
            ["Petugas", entry.receivedBy.name],
            ["Asal barang", entry.sourceName],
            ...(entry.deliveryNoteRef ? [["Surat jalan", entry.deliveryNoteRef] as const] : []),
            ...(entry.notes ? [["Catatan", entry.notes] as const] : []),
          ]} />
        )) } : null} />
    </WorkspaceShell>
  );
}
