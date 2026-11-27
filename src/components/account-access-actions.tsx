"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type SubmitEvent } from "react";
import { accountRoleSchema, type AdminAccount } from "@/modules/identity-access/admin-schema";
import { inputClass, primaryClass, secondaryClass } from "./operations-styles";
import { useHydrated } from "./use-hydrated";

const roleLabels = { EMPLOYEE: "Karyawan", WAREHOUSE: "Petugas Gudang", SUPERADMIN: "Superadmin" } as const;

export function AccountAccessActions({ account }: { account: AdminAccount }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const dialogId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"access" | "revoke-sessions">("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const editing = action === "access";

  function open(next: typeof action) {
    setAction(next);
    setError("");
    setResult("");
    dialog.current?.querySelector("form")?.reset();
    dialog.current?.showModal();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    const values = new FormData(event.currentTarget);
    const role = values.get("role");
    const isActive = values.get("isActive") === "on";
    const body = editing ? {
      ...(role !== account.role ? { role } : {}),
      ...(isActive !== account.isActive ? { isActive } : {}),
    } : {};
    if (editing && Object.keys(body).length === 0) {
      setError("Pilih perubahan akses sebelum menyimpan.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(account.id)}/${action}`, {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 401) { window.location.replace("/login?reason=session-expired"); return; }
      if (response.status === 429) {
        const wait = response.headers.get("Retry-After");
        setError(wait ? `Coba lagi setelah ${wait} detik.` : "Terlalu banyak permintaan. Coba lagi nanti.");
        return;
      }
      const payload = await response.json() as { error?: { message?: string }; data?: { revokedSessions: number } };
      if (!response.ok) {
        setError(payload.error?.message ?? "Aksi belum dapat diselesaikan.");
        return;
      }
      dialog.current?.close();
      setResult(`${editing ? "Akses akun tersimpan." : "Pencabutan sesi selesai."} ${payload.data?.revokedSessions ?? 0} sesi dicabut.`);
      router.refresh();
    } catch {
      setError("Hasil pengiriman belum diketahui. Muat ulang daftar akun untuk memeriksa hasilnya.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className={secondaryClass} disabled={!hydrated || pending} type="button" onClick={() => open("access")}>Ubah akses</button>
        <button className={secondaryClass} disabled={!hydrated || pending} type="button" onClick={() => open("revoke-sessions")}>Cabut sesi</button>
      </div>
      {result && <p role="status" className="text-sm text-muted-foreground">{result}</p>}
      <dialog ref={dialog} aria-labelledby={dialogId} className="fixed inset-0 m-auto w-[min(92vw,32rem)] rounded-lg border bg-card p-5 text-foreground shadow-lg backdrop:bg-slate-900/50 sm:p-7"
        onCancel={(event) => { if (pending) event.preventDefault(); }}>
        <form key={action} method="post" onSubmit={submit} aria-busy={pending} className="space-y-4">
          <div className="space-y-1">
            <h2 id={dialogId} className="text-xl font-semibold">{editing ? "Ubah akses akun" : "Cabut sesi akun"}</h2>
            <p className="wrap-anywhere text-sm text-muted-foreground">{account.name} · {account.email}</p>
          </div>
          {editing ? <fieldset disabled={pending} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={`${dialogId}-role`} className="block text-sm font-medium">Role</label>
              <select id={`${dialogId}-role`} className={inputClass} name="role" defaultValue={account.role}>
                {accountRoleSchema.options.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </select>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={account.isActive} /> Akun aktif</label>
            <p className="text-sm text-muted-foreground">Perubahan akses mencabut semua sesi akun ini.</p>
          </fieldset> : <p className="text-sm text-muted-foreground">Pengguna perlu masuk lagi untuk melanjutkan.</p>}
          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending} className={secondaryClass} onClick={() => dialog.current?.close()}>Batal</button>
            <button type="submit" disabled={pending} className={primaryClass}>{pending ? "Memproses…" : editing ? "Simpan perubahan" : "Konfirmasi pencabutan"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
