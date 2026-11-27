"use client";

import { useId, useState } from "react";
import type { CatalogItem } from "@/modules/catalog/schema";
import { inputClass, secondaryClass } from "./operations-styles";
import { useHydrated } from "./use-hydrated";

type ItemOption = Pick<CatalogItem, "id" | "code" | "name" | "unit" | "stock">;
type ItemSelection = Pick<ItemOption, "id"> & Partial<ItemOption>;

export function CatalogItemPicker({ initialItem, onSelect }: { initialItem?: ItemSelection; onSelect?: (item: ItemOption | undefined) => void }) {
  const hydrated = useHydrated();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemOption[]>([]);
  const [selected, setSelected] = useState(initialItem);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  async function search() {
    if (searching) return;
    setSearching(true);
    setMessage("");
    setItems([]);
    try {
      const params = new URLSearchParams({ q: query, limit: "10" });
      const response = await fetch(`/api/items?${params}`, { signal: AbortSignal.timeout(30_000) });
      if (response.status === 401) return window.location.replace("/login?reason=session-expired");
      if (response.status === 429) {
        const wait = response.headers.get("Retry-After");
        setMessage(wait ? `Coba cari lagi setelah ${wait} detik.` : "Terlalu banyak pencarian. Coba lagi nanti.");
        return;
      }
      if (!response.ok) throw new Error("Pencarian gagal");
      const result: { data: ItemOption[]; meta: { total: number } } = await response.json();
      setItems(result.data);
      if (result.data.length === 0) setMessage("Barang tidak ditemukan.");
      if (result.meta.total > result.data.length) setMessage("Persempit pencarian untuk menemukan barang lainnya.");
    } catch {
      setMessage("Pencarian belum tersedia. Coba lagi.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={searchId} className="block text-sm font-medium">Cari barang berdasarkan kode atau nama</label>
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <input id={searchId} type="search" maxLength={100} className={inputClass} value={query} disabled={!hydrated}
          onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }} />
        <button type="button" onClick={() => void search()} disabled={!hydrated || searching} className={`${secondaryClass} shrink-0`}>
          {searching ? "Mencari…" : "Cari barang"}
        </button>
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {items.length > 0 && (
        <ul aria-label="Hasil pencarian barang" className="max-h-56 divide-y overflow-auto rounded-md border">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" aria-pressed={item.id === selected?.id} className="w-full wrap-anywhere px-3 py-2 text-left text-sm hover:bg-slate-50 aria-pressed:bg-teal-50"
                onClick={() => { setSelected(item); setItems([]); setMessage(""); onSelect?.(item); }}>
                {item.code} · {item.name} · {item.unit}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-teal-50 px-3 py-2 text-sm">
          <input type="hidden" name="itemId" value={selected.id} />
          <p role="status" className="min-w-0 flex-1 wrap-anywhere">
            {selected.name ? `${selected.code} · ${selected.name} · ${selected.unit}` : `Barang ${selected.id}`}
          </p>
          <button type="button" disabled={!hydrated} className="p-2 font-medium underline" onClick={() => { setSelected(undefined); onSelect?.(undefined); }}>Hapus pilihan</button>
        </div>
      )}
    </div>
  );
}
