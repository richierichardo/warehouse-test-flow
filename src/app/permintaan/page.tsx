import Link from "next/link";
import { redirect } from "next/navigation";
import { inputClass, primaryClass, secondaryClass } from "@/components/operations-styles";
import { RequestStatusLabel } from "@/components/request-status";
import { PostingDate, warehouseNumber } from "@/components/stock-history";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";
import { parseRequestQuery, requestStatusLabels, requestStatuses, type RequestQuery } from "@/modules/requisitions/schema";
import { listRequests } from "@/modules/requisitions/service";

function requestPageHref(query: RequestQuery, page: number) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.limit !== 20) params.set("limit", String(query.limit));
  if (page > 1) params.set("page", String(page));
  return params.size ? `/permintaan?${params}` : "/permintaan";
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireWorkspacePrincipal();
  if (!hasAnyPermission(principal.role, ["request:read-own", "request:read-all"])) redirect("/akses-ditolak");
  const own = hasPermission(principal.role, "request:read-own");
  const parsed = parseRequestQuery(await searchParams);
  const result = parsed.success ? await listRequests(getAuthRuntime().db, principal, parsed.data) : null;

  return (
    <WorkspaceShell principal={principal} path="/permintaan">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{own ? "Permintaan Saya" : "Permintaan"}</h1>
          {hasPermission(principal.role, "request:create") && <Link href="/permintaan/baru" prefetch={false} className={primaryClass}>Buat permintaan</Link>}
        </div>
        {parsed.success && result ? <>
          <form key={requestPageHref(parsed.data, 1)} method="get" action="/permintaan" aria-label="Filter permintaan" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
            <div className="min-w-40 space-y-2">
              <label htmlFor="request-status-filter" className="block text-sm font-medium">Status</label>
              <select id="request-status-filter" name="status" className={inputClass} defaultValue={parsed.data.status ?? ""}>
                <option value="">Semua status</option>
                {requestStatuses.map((status) => <option key={status} value={status}>{requestStatusLabels[status]}</option>)}
              </select>
            </div>
            {parsed.data.limit !== 20 && <input type="hidden" name="limit" value={parsed.data.limit} />}
            <button className={primaryClass} type="submit">Terapkan filter</button>
            {(parsed.data.status || parsed.data.page > 1 || parsed.data.limit !== 20) && <Link className={secondaryClass} href="/permintaan" prefetch={false}>Reset</Link>}
          </form>
          {result.data.length ? (
            <ul aria-label="Daftar permintaan" className="space-y-3">
              {result.data.map((entry) => (
                <li key={entry.id} className="space-y-3 rounded-lg border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h2 className="font-semibold wrap-anywhere">{entry.item.name}</h2>
                      <Link href={`/permintaan/${entry.id}`} prefetch={false} className="wrap-anywhere text-sm font-medium text-[#136760] underline">{entry.requestNo}</Link>
                    </div>
                    <RequestStatusLabel status={entry.status} />
                  </div>
                  <dl className="flex flex-wrap gap-4 border-t pt-3 text-sm sm:gap-8">
                    <div><dt className="text-muted-foreground">Jumlah</dt><dd>{warehouseNumber.format(entry.quantity)} {entry.item.unit}</dd></div>
                    <div><dt className="text-muted-foreground">Diajukan</dt><dd><PostingDate value={entry.createdAt} /></dd></div>
                    {entry.requester && <div className="min-w-0"><dt className="text-muted-foreground">Pemohon</dt><dd className="wrap-anywhere">{entry.requester.name}</dd></div>}
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              <p>{result.meta.total > 0 ? "Halaman ini tidak memuat permintaan." : "Belum ada permintaan yang cocok."}</p>
              {result.meta.total > 0 && <Link className="font-medium text-[#136760] underline" href={requestPageHref(parsed.data, 1)} prefetch={false}>Halaman pertama</Link>}
            </div>
          )}
          {result.data.length > 0 && <nav aria-label="Halaman permintaan" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>Halaman {warehouseNumber.format(result.meta.page)} dari {warehouseNumber.format(result.meta.totalPages)} · {warehouseNumber.format(result.meta.total)} permintaan</p>
            <div className="flex gap-2">
              {result.meta.page > 1 && <Link className={secondaryClass} href={requestPageHref(parsed.data, result.meta.page - 1)} prefetch={false}>Sebelumnya</Link>}
              {result.meta.page < result.meta.totalPages && <Link className={secondaryClass} href={requestPageHref(parsed.data, result.meta.page + 1)} prefetch={false}>Berikutnya</Link>}
            </div>
          </nav>}
        </> : <div role="alert" className="space-y-2 rounded-lg border bg-card p-6 text-sm">
          <p>Filter permintaan tidak valid.</p>
          <Link href="/permintaan" prefetch={false} className="font-medium text-[#136760] underline">Reset filter</Link>
        </div>}
      </div>
    </WorkspaceShell>
  );
}
