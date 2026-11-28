import Link from "next/link";
import type { ReactNode } from "react";
import { dateOnly } from "@/lib/warehouse-date";
import { movementDirectionLabels, type HistoryQuery, type MovementQuery } from "@/modules/inventory/history-query";
import { CatalogItemPicker } from "./catalog-item-picker";
import { inputClass, primaryClass, secondaryClass } from "./operations-styles";

export const warehouseNumber = new Intl.NumberFormat("id-ID");
const documentDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });
const postingDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export function DocumentDate({ value }: { value: string }) {
  return <time dateTime={value}>{documentDate.format(dateOnly(value))}</time>;
}

export function PostingDate({ value }: { value: string }) {
  return <time dateTime={value}>{postingDate.format(new Date(value))} WIB</time>;
}

type StockHistoryQuery = HistoryQuery & { direction?: MovementQuery["direction"] };

function historyHref(path: string, query: StockHistoryQuery, page: number) {
  const params = new URLSearchParams();
  if (query.itemId) params.set("itemId", query.itemId);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.direction) params.set("direction", query.direction);
  if (query.limit !== 20) params.set("limit", String(query.limit));
  if (page > 1) params.set("page", String(page));
  return params.size ? `${path}?${params}` : path;
}

type HistoryProps = {
  path: string;
  title: string;
  rangeLabel: string;
  canReceive?: boolean;
  movementFilter?: boolean;
  listing: {
    query: StockHistoryQuery;
    meta: { total: number; totalPages: number };
    item?: { id: string; code: string; name: string; unit: string };
    entries: ReactNode[];
  } | null;
};

export function StockHistory({ path, title, rangeLabel, canReceive, movementFilter, listing }: HistoryProps) {
  return (
    <div className="space-y-7 sm:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {canReceive && <Link className={primaryClass} href="/penerimaan/baru" prefetch={false}>Catat penerimaan</Link>}
      </div>
      {listing ? <>
        <form key={historyHref(path, listing.query, 1)} method="get" action={path} aria-label={`Filter ${title.toLowerCase()}`} className="space-y-5 rounded-2xl border bg-card p-5 sm:space-y-6 sm:p-6 lg:p-7">
          <div className="max-w-xl">
            <CatalogItemPicker initialItem={listing.query.itemId ? listing.item ?? { id: listing.query.itemId } : undefined} />
          </div>
          <div className={`grid items-end gap-4 sm:grid-cols-2 sm:gap-5 ${movementFilter ? "xl:grid-cols-3" : ""}`}>
            <label className="block min-w-0 space-y-2 text-sm font-medium">
              <span className="block">{rangeLabel} mulai</span>
              <input name="from" type="date" className={inputClass} defaultValue={listing.query.from} />
            </label>
            <label className="block min-w-0 space-y-2 text-sm font-medium">
              <span className="block">{rangeLabel} sampai</span>
              <input name="to" type="date" className={inputClass} defaultValue={listing.query.to} />
            </label>
            {movementFilter && <div className="min-w-0 space-y-2">
              <label htmlFor="movement-direction" className="block text-sm font-medium">Arah mutasi</label>
              <select id="movement-direction" className={inputClass} name="direction" defaultValue={listing.query.direction ?? ""}>
                <option value="">Semua arah</option>
                {Object.entries(movementDirectionLabels).map(([direction, label]) => <option key={direction} value={direction}>{label}</option>)}
              </select>
            </div>}
          </div>
          {listing.query.limit !== 20 && <input type="hidden" name="limit" value={listing.query.limit} />}
          <div className="flex flex-wrap gap-3 border-t pt-4 sm:pt-5">
            <button className={primaryClass} type="submit">Terapkan filter</button>
            {(listing.query.itemId || listing.query.from || listing.query.to || listing.query.direction || listing.query.page > 1 || listing.query.limit !== 20) && (
              <Link className={secondaryClass} href={path} prefetch={false}>Reset</Link>
            )}
          </div>
        </form>
        {listing.entries.length > 0 ? (
          <ul aria-label={`Daftar ${title.toLowerCase()}`} className="space-y-4">{listing.entries}</ul>
        ) : (
          <div className="space-y-2 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            <p>{listing.meta.total ? "Halaman ini tidak memuat hasil." : "Belum ada catatan yang cocok."}</p>
            {listing.meta.total > 0 && <Link className="font-medium text-[#136760] underline" href={historyHref(path, listing.query, 1)} prefetch={false}>Halaman pertama</Link>}
          </div>
        )}
        {listing.entries.length > 0 && (
          <nav aria-label={`Halaman ${title.toLowerCase()}`} className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>Halaman {warehouseNumber.format(listing.query.page)} dari {warehouseNumber.format(listing.meta.totalPages)} · {warehouseNumber.format(listing.meta.total)} catatan</p>
            <div className="flex gap-2">
              {listing.query.page > 1 && <Link className={secondaryClass} href={historyHref(path, listing.query, listing.query.page - 1)} prefetch={false}>Sebelumnya</Link>}
              {listing.query.page < listing.meta.totalPages && <Link className={secondaryClass} href={historyHref(path, listing.query, listing.query.page + 1)} prefetch={false}>Berikutnya</Link>}
            </div>
          </nav>
        )}
      </> : (
        <div role="alert" className="space-y-2 rounded-lg border bg-card p-6 text-sm">
          <p>Filter tidak valid. Periksa barang dan rentang tanggal.</p>
          <Link href={path} prefetch={false} className="font-medium text-[#136760] underline">Reset filter</Link>
        </div>
      )}
    </div>
  );
}

export function HistoryEntry({ title, reference, fields }: { title: string; reference: string | null; fields: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <li className="space-y-4 rounded-2xl border bg-card p-5 sm:space-y-5 sm:p-6">
      <div className="space-y-1.5">
        <h2 className="text-lg leading-snug font-semibold wrap-anywhere">{title}</h2>
        {reference && <p className="wrap-anywhere font-mono text-sm text-muted-foreground">{reference}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-4 text-sm sm:gap-x-7 sm:pt-5 xl:grid-cols-4">
        {fields.map(([label, value]) => <div key={label} className="min-w-0 space-y-1"><dt className="text-muted-foreground">{label}</dt><dd className="wrap-anywhere font-semibold">{value}</dd></div>)}
      </dl>
    </li>
  );
}
