"use client";

import Link from "next/link";
import { primaryClass, secondaryClass } from "./operations-styles";

export function ErrorRecovery() {
  return (
    <main data-app-error className="grid min-h-dvh place-items-center px-5 py-12 sm:px-8">
      <section aria-labelledby="error-title" className="w-full max-w-xl space-y-5 rounded-2xl border bg-card p-7 sm:p-10">
        <div className="space-y-3" role="alert">
          <h1 id="error-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Halaman belum bisa dimuat</h1>
          <p className="leading-7 text-muted-foreground">Muat ulang halaman untuk melanjutkan, atau kembali ke beranda.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={primaryClass} onClick={() => window.location.reload()}>Coba lagi</button>
          <Link href="/" prefetch={false} className={secondaryClass}>Kembali ke beranda</Link>
        </div>
      </section>
    </main>
  );
}
