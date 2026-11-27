"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-5 py-16 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Halaman belum bisa dimuat</h1>
      <p className="text-sm text-muted-foreground">Layanan sementara tidak tersedia.</p>
      <button type="button" onClick={reset} className="rounded-md bg-[#136760] px-4 py-2.5 text-sm font-semibold text-white">Coba lagi</button>
    </main>
  );
}
