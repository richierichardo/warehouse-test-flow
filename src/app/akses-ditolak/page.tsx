import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16 sm:px-8">
      <Card className="space-y-4 p-7 sm:p-9">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Akses ditolak</h1>
        <p className="text-sm leading-6 text-muted-foreground">Role akun Anda tidak memiliki akses ke halaman tersebut.</p>
        <Link href="/ruang-kerja" prefetch={false} className="inline-flex min-h-11 items-center rounded-md bg-[#136760] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0e514c]">Kembali ke ruang kerja</Link>
      </Card>
    </main>
  );
}
