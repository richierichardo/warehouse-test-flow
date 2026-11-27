"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type SubmitEvent } from "react";
import { itemFieldLimits, type CatalogItem } from "@/modules/catalog/schema";

const fields = [
  ["code", "Kode barang"], ["name", "Nama barang"], ["unit", "Satuan"], ["location", "Lokasi rak"],
] as const;

const subscribeToHydration = () => () => {};

export function CatalogItemForm({ item, metadataLocked = false }: { item?: CatalogItem; metadataLocked?: boolean }) {
  // The server-rendered form must wait for its client-side submit handler.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");

    const values = new FormData(event.currentTarget);
    const body = Object.fromEntries(fields
      .filter(([key]) => !metadataLocked || (key !== "code" && key !== "unit"))
      .map(([key]) => [key, String(values.get(key) ?? "")]));
    if (Object.values(body).some((value) => !value.trim())) {
      setError("Isi semua field yang tersedia.");
      return;
    }
    setPending(true);

    try {
      const response = await fetch(item ? `/api/items/${item.id}` : "/api/items", {
        method: item ? "PATCH" : "POST",
        credentials: "same-origin",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) return window.location.replace("/katalog");
      if (response.status === 401) return window.location.replace("/login?reason=session-expired");
      if (response.status === 403) return window.location.replace("/akses-ditolak");

      if (response.status === 409) {
        const payload = await response.json() as { error?: { code?: string } };
        setError(payload.error?.code === "ITEM_METADATA_LOCKED"
          ? "Kode dan satuan tidak dapat diubah setelah ada permintaan atau mutasi stok. Muat ulang halaman untuk memperbarui form."
          : "Kode barang sudah digunakan. Pilih kode lain.");
      } else if (response.status === 422) {
        setError("Periksa kembali format dan panjang metadata barang.");
      } else if (response.status === 404) {
        setError("Barang tidak ditemukan.");
      } else if (response.status === 429) {
        const seconds = Number(response.headers.get("Retry-After"));
        setError(Number.isInteger(seconds) && seconds > 0 ? `Coba lagi setelah ${seconds} detik.` : "Terlalu banyak permintaan. Coba lagi nanti.");
      } else {
        setError("Barang belum dapat disimpan. Coba lagi.");
      }
    } catch {
      setError("Koneksi ke layanan terputus. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} aria-busy={pending} className="max-w-2xl space-y-6 rounded-lg border bg-card p-5 sm:p-8">
      {metadataLocked && <p id="locked-metadata" className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-950">Kode dan satuan terkunci karena barang memiliki riwayat permintaan atau mutasi stok.</p>}
      {!item && <p className="text-sm text-muted-foreground">Stok awal barang adalah 0.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label]) => {
          const locked = metadataLocked && (key === "code" || key === "unit");
          return (
            <div key={key} className="min-w-0 space-y-2">
              <label htmlFor={key} className="block text-sm font-medium">{label}</label>
              <input id={key} name={key} defaultValue={item?.[key]} maxLength={itemFieldLimits[key]} required={!locked} readOnly={locked}
                aria-describedby={locked ? "locked-metadata" : undefined}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm read-only:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" />
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!hydrated || pending} className="min-h-11 rounded-md bg-[#136760] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e514c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60">
          {pending ? "Menyimpan…" : "Simpan barang"}
        </button>
        <Link href="/katalog" prefetch={false} className="inline-flex min-h-11 items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Batal</Link>
      </div>
    </form>
  );
}
