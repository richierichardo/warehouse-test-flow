import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-24">
      <Card className="space-y-4 p-7 sm:p-12">
        <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-5xl">
          Gudang Perlengkapan Kantor
        </h1>
        <p className="max-w-md text-base leading-7 text-muted-foreground">
          Fondasi aplikasi sudah tersedia. Katalog, penerimaan, dan permintaan barang akan ditambahkan bertahap.
        </p>
      </Card>
    </main>
  );
}
