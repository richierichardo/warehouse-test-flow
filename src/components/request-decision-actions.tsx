"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type SubmitEvent } from "react";
import { maxRejectionReason, rejectRequestSchema, type RequestStatus } from "@/modules/requisitions/schema";
import { inputClass, primaryClass, secondaryClass } from "./operations-styles";
import { useHydrated } from "./use-hydrated";

type Action = "approve" | "reject";
const numberFormat = new Intl.NumberFormat("id-ID");

export function RequestDecisionActions({ id, status, item, quantity }: {
  id: string; status: RequestStatus; item: { name: string; unit: string }; quantity: number;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Action>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string; conflict: boolean }>();
  const rejecting = action === "reject";

  function open(nextAction: Action) {
    setAction(nextAction);
    setError("");
    dialog.current?.querySelector("form")?.reset();
    dialog.current?.showModal();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || pending || result) return;
    setError("");

    let body: { reason?: string } = {};
    if (action === "reject") {
      const parsed = rejectRequestSchema.safeParse({ reason: new FormData(event.currentTarget).get("reason") });
      if (!parsed.success) {
        setError("Isi alasan penolakan sepanjang 1–500 karakter.");
        return;
      }
      body = parsed.data;
    }

    setPending(true);
    try {
      const response = await fetch(`/api/requests/${id}/${action}`, {
        method: "POST", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (response.status === 401) return window.location.replace("/login?reason=session-expired");
      if (response.status === 403) return window.location.replace("/akses-ditolak");
      if (response.status === 429) {
        const wait = response.headers.get("Retry-After");
        setError(wait ? `Coba lagi setelah ${wait} detik.` : "Terlalu banyak permintaan. Coba lagi nanti.");
        return;
      }

      const payload = await response.json() as { error?: { code?: string; message?: string } };
      const conflict = payload.error?.code === "ALREADY_DECIDED";
      if (response.ok || conflict) {
        dialog.current?.close();
        setResult({ conflict, message: conflict ? "Permintaan ini sudah diputuskan. Status terbaru sedang dimuat." : "Keputusan tersimpan." });
        router.refresh();
        return;
      }
      setError(payload.error?.message ?? "Keputusan belum dapat disimpan. Coba lagi.");
    } catch {
      setError("Hasil pengiriman belum diketahui. Coba ulangi keputusan yang sama.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {result && <p role={result.conflict ? "alert" : "status"} className="text-sm text-muted-foreground">{result.message}</p>}
      {status === "PENDING" && !result && <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryClass} disabled={!hydrated} onClick={() => open("approve")}>Setujui</button>
        <button type="button" className={secondaryClass} disabled={!hydrated} onClick={() => open("reject")}>Tolak</button>
      </div>}
      <dialog ref={dialog} aria-labelledby="request-decision-title" className="fixed inset-0 m-auto w-[min(92vw,32rem)] rounded-lg border bg-card p-5 text-foreground shadow-lg backdrop:bg-slate-900/50 sm:p-7"
        onCancel={(event) => { if (pending) event.preventDefault(); }}>
        <form key={action} method="post" onSubmit={submit} aria-busy={pending} className="space-y-5">
          <div className="space-y-2">
            <h2 id="request-decision-title" className="text-xl font-semibold">{rejecting ? "Tolak permintaan" : "Setujui permintaan"}</h2>
            <p className="wrap-anywhere text-sm text-muted-foreground">{item.name} · {numberFormat.format(quantity)} {item.unit}</p>
          </div>
          {rejecting && <div className="space-y-2">
            <label htmlFor="request-rejection-reason" className="block text-sm font-medium">Alasan penolakan</label>
            <textarea id="request-rejection-reason" name="reason" rows={3} maxLength={maxRejectionReason} required disabled={pending} className={inputClass} />
          </div>}
          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={secondaryClass} disabled={pending} onClick={() => dialog.current?.close()}>Batal</button>
            <button type="submit" className={primaryClass} disabled={pending}>
              {pending ? "Menyimpan…" : rejecting ? "Konfirmasi penolakan" : "Konfirmasi persetujuan"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
