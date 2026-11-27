import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { listCatalog } from "@/modules/catalog/service";
import { parseCatalogQuery, type CatalogItem, type CatalogQuery } from "@/modules/catalog/schema";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";

const stockFormat = new Intl.NumberFormat("id-ID");
const controlClass = "h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const primaryClass = "inline-flex min-h-11 items-center justify-center rounded-md bg-[#136760] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e514c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const secondaryClass = "inline-flex min-h-10 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

function catalogHref(query: CatalogQuery, page: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.limit !== 20) params.set("limit", String(query.limit));
  if (query.sort !== "code") params.set("sort", query.sort);
  if (query.direction !== "asc") params.set("direction", query.direction);
  if (page > 1) params.set("page", String(page));
  return params.size ? `/katalog?${params}` : "/katalog";
}

function ItemEditLink({ item }: { item: CatalogItem }) {
  return <Link href={`/katalog/${item.id}/edit`} prefetch={false} aria-label={`Edit ${item.name}`} className={secondaryClass}>Edit</Link>;
}

function CatalogFilters({ query }: { query: CatalogQuery }) {
  return (
    <form method="get" action="/katalog" aria-label="Filter katalog" className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(14rem,1fr)_9rem_9rem_auto] xl:items-end">
      <div className="space-y-2">
        <label htmlFor="catalog-search" className="block text-sm font-medium">Cari kode atau nama</label>
        <input id="catalog-search" name="q" type="search" maxLength={100} defaultValue={query.q} className={controlClass} />
      </div>
      <div className="space-y-2">
        <label htmlFor="catalog-sort" className="block text-sm font-medium">Urutkan</label>
        <select id="catalog-sort" name="sort" defaultValue={query.sort} className={controlClass}>
          <option value="code">Kode</option><option value="name">Nama</option><option value="stock">Stok</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="catalog-direction" className="block text-sm font-medium">Arah</label>
        <select id="catalog-direction" name="direction" defaultValue={query.direction} className={controlClass}>
          <option value="asc">Menaik</option><option value="desc">Menurun</option>
        </select>
      </div>
      {query.limit !== 20 && <input type="hidden" name="limit" value={query.limit} />}
      <button type="submit" className={primaryClass}>Cari</button>
    </form>
  );
}

function CatalogItems({ items, canEdit }: { items: CatalogItem[]; canEdit: boolean }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Daftar barang</caption>
          <thead className="bg-slate-50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3" scope="col">Kode</th>
              <th className="px-4 py-3" scope="col">Nama</th>
              <th className="px-4 py-3" scope="col">Satuan</th>
              <th className="px-4 py-3" scope="col">Lokasi</th>
              <th className="px-4 py-3 text-right" scope="col">Stok</th>
              {canEdit && <th className="px-4 py-3" scope="col">Tindakan</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-medium wrap-anywhere">{item.code}</td>
                <td className="px-4 py-3 wrap-anywhere">{item.name}</td>
                <td className="px-4 py-3 wrap-anywhere">{item.unit}</td>
                <td className="px-4 py-3 wrap-anywhere">{item.location}</td>
                <td className="px-4 py-3 text-right tabular-nums">{stockFormat.format(item.stock)}</td>
                {canEdit && <td className="px-4 py-3"><ItemEditLink item={item} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label="Daftar barang" className="space-y-3 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="space-y-1">
              <h2 className="font-semibold wrap-anywhere">{item.name}</h2>
              <p className="text-sm text-muted-foreground wrap-anywhere">{item.code}</p>
            </div>
            <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-sm">
              <div><dt className="text-muted-foreground">Satuan</dt><dd className="wrap-anywhere">{item.unit}</dd></div>
              <div><dt className="text-muted-foreground">Lokasi</dt><dd className="wrap-anywhere">{item.location}</dd></div>
              <div><dt className="text-muted-foreground">Stok</dt><dd className="font-semibold tabular-nums wrap-anywhere">{stockFormat.format(item.stock)}</dd></div>
            </dl>
            {canEdit && <ItemEditLink item={item} />}
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireWorkspacePrincipal();
  const canEdit = hasPermission(principal.role, "catalog:write");
  const parsed = parseCatalogQuery(await searchParams);
  const results = parsed.success ? await listCatalog(getAuthRuntime().db, principal, parsed.data) : null;

  return (
    <WorkspaceShell principal={principal} path="/katalog">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Katalog</h1>
          {canEdit && <Link href="/katalog/baru" prefetch={false} className={primaryClass}>Tambah barang</Link>}
        </div>
        {parsed.success && results ? (
          <>
            <CatalogFilters query={parsed.data} />
            {results.data.length ? <CatalogItems items={results.data} canEdit={canEdit} /> : (
              <div className="space-y-3 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                <p>{results.meta.total > 0 ? "Halaman ini tidak memuat barang." : parsed.data.q ? "Tidak ada barang yang cocok." : "Belum ada barang di katalog."}</p>
                {results.meta.total > 0 && <Link href={catalogHref(parsed.data, 1)} prefetch={false} className="font-medium text-[#136760] underline">Kembali ke halaman pertama</Link>}
              </div>
            )}
            {results.data.length > 0 && (
              <nav aria-label="Halaman katalog" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <p>Halaman {stockFormat.format(results.meta.page)} dari {stockFormat.format(results.meta.totalPages)} · {stockFormat.format(results.meta.total)} barang</p>
                <div className="flex gap-2">
                  {results.meta.page > 1 && <Link className={secondaryClass} href={catalogHref(parsed.data, results.meta.page - 1)} prefetch={false}>Sebelumnya</Link>}
                  {results.meta.page < results.meta.totalPages && <Link className={secondaryClass} href={catalogHref(parsed.data, results.meta.page + 1)} prefetch={false}>Berikutnya</Link>}
                </div>
              </nav>
            )}
          </>
        ) : (
          <div className="space-y-3 rounded-lg border bg-card p-6 text-sm" role="alert">
            <p>Filter katalog tidak valid.</p>
            <Link href="/katalog" prefetch={false} className="font-medium text-[#136760] underline">Reset filter</Link>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
