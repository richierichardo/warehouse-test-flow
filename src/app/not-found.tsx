import Link from "next/link";
import { primaryClass } from "@/components/operations-styles";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16 sm:px-8">
      <section className="space-y-5 rounded-2xl border bg-card p-7 sm:p-9">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Halaman tidak ditemukan</h1>
        <p className="leading-7 text-muted-foreground">Periksa kembali alamat halaman atau kembali ke beranda.</p>
        <Link href="/" className={primaryClass}>Kembali ke beranda</Link>
      </section>
    </main>
  );
}
