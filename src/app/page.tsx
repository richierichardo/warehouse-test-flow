import Link from "next/link";
import { landingContact } from "./landing-contact";

const steps = [
  { role: "Karyawan", title: "Cek stok dan ajukan barang", detail: "Buka katalog, pilih perlengkapan yang dibutuhkan, lalu pantau hasilnya lewat Permintaan Saya." },
  { role: "Petugas Gudang", title: "Catat dan periksa mutasi", detail: "Catat barang masuk, putuskan permintaan, dan cocokkan saldo setiap transaksi di Kartu Stok." },
  { role: "Superadmin", title: "Kelola akses akun", detail: "Atur peran atau status akun, cabut sesi bila diperlukan, dan lihat riwayat perubahan di Audit." },
];

const questions = [
  { question: "Bagaimana cara mendapatkan akun?", answer: "Gunakan akun yang diberikan oleh pengelola aplikasi. Masuk dengan email dan password akun tersebut." },
  { question: "Kapan stok berkurang?", answer: "Stok berkurang ketika petugas berhasil menyetujui permintaan. Permintaan yang masih menunggu atau sudah ditolak tidak mengubah stok." },
  { question: "Apa yang terjadi jika stok kurang?", answer: "Persetujuan dibatalkan dan permintaan tetap Menunggu. Petugas dapat memeriksa saldo terbaru atau menolak permintaan dengan alasan." },
  { question: "Di mana saya bisa melihat riwayat?", answer: "Karyawan melihat pengajuannya di Permintaan Saya. Petugas dapat melihat barang masuk, barang keluar, dan saldo setelah setiap transaksi di Kartu Stok." },
];

const loginClass = "inline-flex min-h-12 items-center justify-center rounded-lg bg-[#176459] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[#114b43] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#176459] motion-reduce:transition-none";

export default function Home() {
  const hasContact = Boolean(landingContact.email || landingContact.phone);
  return (
    <div className="min-h-screen bg-[#f8f9f6] text-[#172c3d]">
      <a href="#konten" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-lg focus:bg-white focus:p-3">Lewati ke konten</a>
      <header className="border-b border-[#dbe2dc]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-8 lg:px-12">
          <Link href="/" className="min-h-12 content-center font-bold tracking-tight sm:text-lg">Warehouse Testing</Link>
          <nav aria-label="Navigasi beranda" className="order-last flex w-full items-center gap-6 text-sm font-medium sm:order-none sm:ml-auto sm:w-auto">
            <a href="#cara-pakai" className="min-h-11 content-center hover:underline">Cara pakai</a>
            <a href="#faq" className="min-h-11 content-center hover:underline">FAQ</a>
            {hasContact && <a href="#kontak" className="min-h-11 content-center hover:underline">Kontak</a>}
          </nav>
          <Link href="/login" className={loginClass + " text-sm"}>Masuk</Link>
        </div>
      </header>

      <main id="konten" tabIndex={-1}>
        <section aria-labelledby="judul" className="mx-auto grid max-w-7xl items-center gap-10 px-5 pt-12 pb-16 sm:px-8 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-12 lg:px-12 lg:py-24">
          <div>
            <h1 id="judul" className="max-w-[10ch] text-[clamp(2.9rem,8vw,6.5rem)] leading-[0.91] font-semibold tracking-[-0.065em] text-balance">Warehouse Testing</h1>
            <p className="mt-7 max-w-md text-base leading-7 text-[#475d62] sm:text-lg sm:leading-8">Aplikasi pengujian pengelolaan perlengkapan kantor. Cek stok, ajukan kebutuhan, dan ikuti setiap transaksi dari penerimaan hingga barang keluar.</p>
            <div className="mt-7 flex flex-wrap items-center gap-4 sm:gap-6">
              <Link href="/login" className={loginClass}>Masuk ke aplikasi</Link>
              <a href="#demo" className="inline-flex min-h-12 items-center font-semibold text-[#176459] underline decoration-[#99b7ae] underline-offset-4 hover:decoration-current">Lihat demo</a>
            </div>
          </div>
          <figure id="demo" className="min-w-0 scroll-mt-6">
            <div className="rounded-[1.35rem] bg-[#172c3d] p-2 ring-1 ring-[#172c3d]/10 sm:p-3">
              <video controls playsInline preload="none" width={1120} height={760} poster="/demo/warehouse-poster.jpg" aria-label="Video cara pakai Warehouse Testing" className="block aspect-28/19 w-full rounded-xl bg-[#0b202b]">
                <source src="/demo/papi-warehouse-demo.webm" type="video/webm" />
                <source src="/demo/papi-warehouse-demo.mp4" type="video/mp4" />
                <a href="/demo/papi-warehouse-demo.mp4">Buka video demo MP4</a>
              </video>
            </div>
            <figcaption className="mt-3 flex flex-wrap justify-between gap-x-5 gap-y-1 text-sm text-[#475d62]">
              <span>Demo alur permintaan dan stok</span>
              <span>1 menit 53 detik</span>
            </figcaption>
          </figure>
        </section>

        <section id="cara-pakai" aria-labelledby="judul-cara-pakai" className="scroll-mt-6 border-y border-[#dbe2dc] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
            <h2 id="judul-cara-pakai" className="text-3xl font-semibold tracking-tight sm:text-4xl">Cara pakai</h2>
            <p className="mt-3 max-w-prose leading-7 text-[#475d62]">Masuk dengan akun Anda untuk membuka menu sesuai peran.</p>
            <ul className="mt-8 grid gap-6 md:grid-cols-3 md:gap-8 lg:gap-12">
              {steps.map(({ role, title, detail }) => (
                <li key={role} className="border-t border-[#a8bdb5] pt-4">
                  <p className="text-sm font-semibold text-[#176459]">{role}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-2 max-w-md leading-7 text-[#475d62]">{detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" aria-labelledby="judul-faq" className="mx-auto grid max-w-7xl scroll-mt-6 gap-8 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[0.72fr_1.28fr] lg:px-12">
          <h2 id="judul-faq" className="text-3xl font-semibold tracking-tight sm:text-4xl">Pertanyaan umum</h2>
          <div className="divide-y divide-[#dbe2dc] border-y border-[#dbe2dc]">
            {questions.map(({ question, answer }) => (
              <details key={question} className="group">
                <summary className="flex min-h-15 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold hover:text-[#176459] [&::-webkit-details-marker]:hidden">
                  {question}
                  <span className="shrink-0 text-xl font-normal text-[#176459]" aria-hidden="true"><span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span></span>
                </summary>
                <p className="max-w-prose pb-4 leading-7 text-[#475d62]">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {hasContact && (
        <footer id="kontak" className="border-t border-[#dbe2dc] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-12">
            <h2 className="text-xl font-semibold">Kontak</h2>
            <address className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[#176459] not-italic">
              {landingContact.email && <a className="min-h-11 content-center wrap-anywhere underline underline-offset-4" href={"mailto:" + landingContact.email}>{landingContact.email}</a>}
              {landingContact.phone && <a className="min-h-11 content-center underline underline-offset-4" href={"tel:" + landingContact.phone.replace(/[^\d+]/g, "")}>{landingContact.phone}</a>}
            </address>
          </div>
        </footer>
      )}
    </div>
  );
}
