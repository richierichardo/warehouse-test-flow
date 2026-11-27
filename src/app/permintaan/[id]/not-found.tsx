import Link from "next/link";
import { primaryClass } from "@/components/operations-styles";

export default function RequestNotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-5 px-5 py-16 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Permintaan tidak ditemukan</h1>
      <Link href="/permintaan" prefetch={false} className={primaryClass}>Kembali ke permintaan</Link>
    </main>
  );
}
