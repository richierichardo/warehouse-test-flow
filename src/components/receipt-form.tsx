"use client";

import Link from "next/link";
import { useRef, useState, type SubmitEvent } from "react";
import { maxReceiptQuantity, receiptFieldLimits, receiveGoodsSchema } from "@/modules/receiving/schema";
import { CatalogItemPicker } from "./catalog-item-picker";
import { inputClass, primaryClass, secondaryClass } from "./operations-styles";
import { useHydrated } from "./use-hydrated";

const numberFormat = new Intl.NumberFormat("id-ID");

export function ReceiptForm({ today }: { today: string }) {
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ receiptNo: string; balanceAfter: number | null }>();
  const keys = useRef(new Map<string, string>());

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || saved) return;
    setError("");
    const values = new FormData(event.currentTarget);
    if (!values.get("itemId")) {
      setError("Pilih satu barang dari hasil pencarian.");
      return;
    }
    const parsed = receiveGoodsSchema.safeParse({
      itemId: values.get("itemId"), quantity: Number(values.get("quantity")), receivedOn: values.get("receivedOn"),
      sourceName: values.get("sourceName"), deliveryNoteRef: values.get("deliveryNoteRef"), notes: values.get("notes"),
    });
    if (!parsed.success) {
      setError("Periksa jumlah, tanggal penerimaan, dan panjang isian.");
      return;
    }

    const body = JSON.stringify(parsed.data);
    const key = keys.current.get(body) ?? crypto.randomUUID();
    keys.current.set(body, key);
    setPending(true);
    try {
      const response = await fetch("/api/receipts", {
        method: "POST", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body,
      });
      if (response.status === 401) return window.location.replace("/login?reason=session-expired");
      if (response.status === 403) return window.location.replace("/akses-ditolak");
      if (response.status >= 500) return setError("Layanan sementara tidak tersedia.");
      if (response.status === 429) {
        const wait = response.headers.get("Retry-After");
        setError(wait ? `Coba lagi setelah ${wait} detik.` : "Terlalu banyak permintaan. Coba lagi nanti.");
        return;
      }
      const result = await response.json() as { data?: { receiptNo: string; balanceAfter: number | null }; error?: { message?: string } };
      if (response.ok && result.data) {
        setSaved(result.data);
        return;
      }
      setError(result.error?.message ?? "Penerimaan belum dapat disimpan. Coba lagi.");
    } catch {
      setError("Hasil pengiriman belum diketahui. Kirim ulang isian yang sama untuk memeriksa penerimaan.");
    } finally {
      setPending(false);
    }
  }

  if (saved) return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-5 sm:p-8">
      <div role="status" className="space-y-2">
        <h2 className="text-xl font-semibold">Penerimaan tersimpan</h2>
        <p className="wrap-anywhere text-sm">Nomor penerimaan {saved.receiptNo}</p>
        {saved.balanceAfter !== null && <p className="text-sm">Saldo setelah penerimaan {numberFormat.format(saved.balanceAfter)}</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link className={primaryClass} href="/penerimaan" prefetch={false}>Lihat riwayat penerimaan</Link>
        <Link className={secondaryClass} href="/kartu-stok" prefetch={false}>Lihat kartu stok</Link>
      </div>
    </div>
  );

  return (
    <form method="post" onSubmit={submit} aria-busy={pending} className="max-w-2xl space-y-5 rounded-lg border bg-card p-5 sm:p-8">
      <fieldset disabled={pending} className="space-y-5">
        <CatalogItemPicker />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            <span>Jumlah</span>
            <input className={inputClass} name="quantity" type="number" min={1} max={maxReceiptQuantity} step={1} required />
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span>Tanggal penerimaan (WIB)</span>
            <input className={inputClass} name="receivedOn" type="date" defaultValue={today} max={today} required />
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span>Asal barang</span>
            <input className={inputClass} name="sourceName" maxLength={receiptFieldLimits.sourceName} required />
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span>Nomor surat jalan (opsional)</span>
            <input className={inputClass} name="deliveryNoteRef" maxLength={receiptFieldLimits.deliveryNoteRef} />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          <span>Catatan (opsional)</span>
          <textarea className={inputClass} name="notes" maxLength={receiptFieldLimits.notes} rows={3} />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!hydrated || pending} className={primaryClass}>{pending ? "Menyimpan…" : "Simpan penerimaan"}</button>
        <Link href="/penerimaan" prefetch={false} className={secondaryClass}>Batal</Link>
      </div>
    </form>
  );
}
