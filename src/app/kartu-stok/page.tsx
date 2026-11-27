import { redirect } from "next/navigation";
import { DocumentDate, HistoryEntry, PostingDate, StockHistory, warehouseNumber } from "@/components/stock-history";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";
import { parseMovementQuery } from "@/modules/inventory/history-query";
import { listMovements } from "@/modules/inventory/service";

export default async function StockCardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "movement:read")) redirect("/akses-ditolak");
  const parsed = parseMovementQuery(await searchParams);
  const result = parsed.success ? await listMovements(getAuthRuntime().db, principal, parsed.data) : null;

  return (
    <WorkspaceShell principal={principal} path="/kartu-stok">
      <StockHistory path="/kartu-stok" title="Kartu Stok" rangeLabel="Tanggal posting (WIB)" movementFilter
        listing={parsed.success && result ? { query: parsed.data, meta: result.meta, item: result.data[0]?.item, entries: result.data.map((entry) => (
          <HistoryEntry key={entry.id} title={`${entry.item.code} · ${entry.item.name}`} reference={entry.receiptNo ?? entry.requestNo} fields={[
            [entry.direction === "IN" ? "Jumlah masuk" : "Jumlah keluar", `${entry.direction === "IN" ? "+" : "−"}${warehouseNumber.format(entry.quantity)} ${entry.item.unit}`],
            ["Saldo setelah mutasi", `${warehouseNumber.format(entry.balanceAfter)} ${entry.item.unit}`],
            ["Tanggal dokumen", entry.receivedOn ? <DocumentDate key="receivedOn" value={entry.receivedOn} /> : "–"],
            ["Waktu posting", <PostingDate key="postedAt" value={entry.postedAt} />],
            ["Petugas", entry.actor.name],
          ]} />
        )) } : null} />
    </WorkspaceShell>
  );
}
