"use client";

import Link from "next/link";
import { useRef, useState, type SubmitEvent } from "react";
import { createRequestSchema, maxRequestNotes, maxRequestQuantity, type RequestStatus } from "@/modules/requisitions/schema";
import { CatalogItemPicker } from "./catalog-item-picker";
import { inputClass, primaryClass, secondaryClass } from "./operations-styles";
import { RequestStatusLabel } from "./request-status";
import { useHydrated } from "./use-hydrated";

const numberFormat = new Intl.NumberFormat("id-ID");
type SavedRequest = { id: string; requestNo: string; status: RequestStatus };

export function RequestForm() {
  const hydrated = useHydrated();
  const [stock, setStock] = useState<number>();
  const [quantity, setQuantity] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedRequest>();
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
    const parsed = createRequestSchema.safeParse({ itemId: values.get("itemId"), quantity: Number(values.get("quantity")), notes: values.get("notes") });
    if (!parsed.success) {
      setError("Periksa jumlah dan panjang catatan.");
      return;
    }

    const body = JSON.stringify(parsed.data);
    const key = keys.current.get(body) ?? crypto.randomUUID();
    keys.current.set(body, key);
    setPending(true);
    try {
      const response = await fetch("/api/requests", {
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
      const result = await response.json() as { data?: SavedRequest; error?: { message?: string } };
      if (response.ok && result.data) {
        setSaved(result.data);
        return;
      }
      setError(result.error?.message ?? "Permintaan belum dapat disimpan. Coba lagi.");
    } catch {
      setError("Hasil pengiriman belum diketahui. Kirim ulang isian yang sama untuk memeriksa permintaan.");
    } finally {
      setPending(false);
    }
  }

  if (saved) return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-5 sm:p-8">
      <div role="status" className="space-y-2">
        <h2 className="text-xl font-semibold">Permintaan tersimpan</h2>
        <p className="wrap-anywhere text-sm">{saved.requestNo}</p>
        <RequestStatusLabel status={saved.status} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Link className={primaryClass} href={`/permintaan/${saved.id}`} prefetch={false}>Lihat detail permintaan</Link>
        <Link className={secondaryClass} href="/permintaan" prefetch={false}>Permintaan Saya</Link>
      </div>
    </div>
  );

  return (
    <form method="post" onSubmit={submit} aria-busy={pending} className="max-w-2xl space-y-5 rounded-lg border bg-card p-5 sm:p-8">
      <fieldset disabled={pending} className="space-y-5">
        <CatalogItemPicker onSelect={(item) => setStock(item?.stock)} />
        <label className="block space-y-2 text-sm font-medium">
          <span>Jumlah</span>
          <input className={inputClass} name="quantity" type="number" min={1} max={maxRequestQuantity} step={1} required
            disabled={!hydrated} value={quantity} onChange={(event) => setQuantity(event.currentTarget.value)} />
        </label>
        {stock !== undefined && <div aria-live="polite" className="space-y-2 text-sm">
          <p>Stok terakhir tercatat {numberFormat.format(stock)}.</p>
          {Number(quantity) > stock && <p className="rounded-md bg-amber-50 px-4 py-3 text-amber-950">Jumlah melebihi stok saat ini. Anda tetap dapat mengirim permintaan.</p>}
        </div>}
        <label className="block space-y-2 text-sm font-medium">
          <span>Catatan (opsional)</span>
          <textarea className={inputClass} name="notes" maxLength={maxRequestNotes} rows={3} />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!hydrated || pending} className={primaryClass}>{pending ? "Mengirim…" : "Kirim permintaan"}</button>
        <Link href="/permintaan" prefetch={false} className={secondaryClass}>Batal</Link>
      </div>
    </form>
  );
}
