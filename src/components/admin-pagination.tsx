import Link from "next/link";
import { secondaryClass } from "./operations-styles";
import { warehouseNumber } from "./stock-history";

export function AdminPagination({ path, meta }: { path: string; meta: { page: number; limit: number; total: number; totalPages: number } }) {
  function href(page: number) {
    return `${path}?${new URLSearchParams({ page: String(page), limit: String(meta.limit) })}`;
  }

  if (!meta.total) return null;
  return (
    <nav aria-label="Halaman hasil" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>{warehouseNumber.format(meta.total)} hasil · Halaman {warehouseNumber.format(meta.page)} dari {warehouseNumber.format(meta.totalPages)}</p>
      <div className="flex flex-wrap gap-2">
        {meta.page > meta.totalPages ? <Link className={secondaryClass} href={href(1)} prefetch={false}>Halaman pertama</Link> : <>
          {meta.page > 1 && <Link className={secondaryClass} href={href(meta.page - 1)} prefetch={false}>Sebelumnya</Link>}
          {meta.page < meta.totalPages && <Link className={secondaryClass} href={href(meta.page + 1)} prefetch={false}>Berikutnya</Link>}
        </>}
      </div>
    </nav>
  );
}
