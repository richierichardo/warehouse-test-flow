# Implementation Plan — 10 Tahap

Rencana bertanggal 26 November 2026. Deadline pengumpulan 28 November 2026 pukul 23.59 WIB. Tahap 01–10 selesai sesuai log eksekusi. Paket pengumpulan lokal memakai jalur video demo.

## Aturan pengerjaan

1. Kerjakan berurutan dan serahkan perubahan tiap tahap dalam kondisi unstaged. Pemilik repo melakukan commit setelah review.
2. Gunakan PRD.md sebagai kontrak. Jika menemukan konflik teknis, perbaiki desain paling kecil yang mempertahankan acceptance criteria dan catat alasannya.
3. Selesaikan P0 terlebih dahulu. Tahap 09/P1 dapat dipangkas bila perlu; jangan mengorbankan correctness atau security.
4. Per tahap catat file berubah, command aktual, hasil, dan batasan. Checkbox hanya dicentang setelah bukti ada.
5. Jangan meneruskan fitur baru ketika kegagalan migrasi, auth, transaksi atau data integrity yang memengaruhi tahap berikutnya belum diperbaiki.
6. Isi log tahap pada bagian terakhir; jangan mencatat hasil test berdasarkan perkiraan.

## Tahap 01 — Bootstrap dan compatibility gate

Status: DONE | Commit: `chore: bootstrap next warehouse application`

**Kerja**
- Scaffold Next.js App Router dengan React dan TypeScript strict; npm + satu lockfile.
- Pilih Node LTS kompatibel; pin `.nvmrc`/engines dan versi stabil framework/library.
- Pasang Tailwind, shadcn/ui, Zod, Prisma 7 + adapter PostgreSQL, Better Auth + Prisma adapter, Vitest dan Playwright.
- Verifikasi dukungan adapter, schema generation, dan import server-only sebelum memperluas fitur. Jangan memakai Prisma 8 RC atau API major lain.
- Buat struktur modul, `.env.example`, `.gitignore`, `compose.yaml` PostgreSQL 17 dengan named volume dan binding lokal.
- Buat script lint, typecheck, unit, integration, e2e, build, dev, start, db:generate, db:migrate, db:migrate:deploy, db:seed, limiter:cleanup.

**Gate**
- Install bersih dari lockfile, halaman awal tampil, koneksi PostgreSQL berhasil, lint/typecheck/build dasar berhasil.
- Catat versi exact dan status aplikasi awal pada README; jangan menulis akun/URL yang belum ada.

Bootstrap mencakup konfigurasi npm, Next.js, TypeScript, ESLint, Tailwind, shadcn/ui, Prisma, dan pengujian di root proyek. `src/app/` memuat halaman awal, `src/modules/` menyiapkan enam modul, `src/lib/` memuat konfigurasi awal Prisma dan Better Auth, dan `tests/` memuat smoke test. `.env.example` dan `compose.yaml` dibagikan bersama source. `.env` berisi secret lokal dan diabaikan Git.

Schema auth dihasilkan ke file sementara dan lolos `prisma validate`. Prisma Client tahap ini dihasilkan dari schema dasar. Next.js menolak impor modul auth/database dari Client Component pada uji kompilasi. Model final, migrasi, dan seed dijadwalkan pada tahap 02.

## Tahap 02 — Schema, migrasi, constraint, seed

Status: DONE | Commit: `5a9cdc2`

**Kerja**
- Generate schema auth dari konfigurasi Better Auth terpilih; simpan sebagai migrasi Prisma bersama model bisnis PRD §9.
- Tambah custom SQL CHECK/unique/FK/index yang tidak tercakup schema Prisma, termasuk arah/source movement dan state request.
- Tambah `RateLimitBucket`, AccessAudit dan tiga role server-owned.
- Implement seed/CLI operator opt-in untuk akun awal dengan hashing library; tidak ada signup publik atau reset credential otomatis.
- Data demo menambah stok melalui receiving service setelah tersedia di tahap 06; jangan mengisi saldo positif tanpa ledger.
- Siapkan database test terpisah dan reset fixture yang tidak pernah mengenai DB production.

**Gate**
- Migrasi dari DB kosong dan seed dua kali aman; constraint menolak stok negatif, kode ganda dan source movement tidak valid.
- Belum klaim seed transaksi selesai sebelum receiving service dibuat.

Migrasi `20261126080120_init_warehouse` berisi model hasil generator Better Auth, model gudang, serta constraint PostgreSQL. `prisma/seed.ts` membuat akun baru melalui satu transaksi dan mempertahankan akun yang sudah ada. Tes integrasi meliputi schema dan CLI seed. Panduan menjalankan migrasi dan seed tersedia di README.

## Tahap 03 — Auth, session, dan baseline HTTP security

Status: DONE | Commit: `df68190`

**Kerja**
- Login/logout Better Auth, public signup disabled, login error generik, hook akun aktif.
- Auth route allowlist hanya get-session/sign-in email/sign-out; verifikasi endpoint library terpilih dan tutup mutation profil/password/plugin yang tidak digunakan.
- Session delapan jam fixed expiry, refresh dan cookie cache disabled; cookie aman di production HTTPS.
- Buat `requirePrincipal()` dengan validasi session + role/status DB terbaru, safe DTO dan private no-store.
- Terapkan trusted origin, safe redirects, request size/content type guard, dan error boundary tanpa secret.
- Bungkus catch-all auth dengan limiter PostgreSQL atomik sejak endpoint login tersedia. Implement policy login/auth PRD §7; baseline keamanan tidak menunggu tahap 09.
- Samakan trusted IP parser untuk library auth dan limiter. Local/direct mode tidak mempercayai header forwarded acak.

**Gate**
- AC01–AC03 dan bagian auth AC17–AC19; expired/revoked session ditolak; N+1 login memberi 429 + Retry-After.
- Tidak ada login alternatif yang memakai `auth.api` tanpa limiter; cookie/secret tidak masuk response/log yang tidak semestinya.

Route auth menjalankan validasi HTTP dan limiter PostgreSQL sebelum Better Auth. Pembacaan session dan `requirePrincipal()` memeriksa role serta status akun terkini. Logout memeriksa penghapusan row session sebelum mengirim respons sukses.

Mode `direct` memakai bucket bersama. Mode `nginx` menggunakan header IP yang ditimpa proxy dan secret terpisah. Tes memakai dua proses Next.js dengan satu database dan membuktikan kuota tetap sama setelah restart. Virtual host Nginx dan TLS diperiksa saat deployment tahap 10.

## Tahap 04 — RBAC, ownership, shell UI

Status: DONE | Commit: `209a78a`

**Kerja**
- Permission map tiga role dan helper deny-by-default; ownership employee pada repository query.
- Buat layout/sidebar sesuai role, halaman login, loading/empty/forbidden/session-expired.
- Buat wrapper business handlers: origin, principal, permission, Zod, rate bucket shared, consistent response/error.
- Terapkan read/write/decision/admin bucket sejak route dipakai, bukan sekadar menambahkan UI cooldown.
- Siapkan test akses langsung endpoint dengan session masing-masing role.

**Gate**
- Employee tidak bisa membuat barang/menerima/approve; warehouse tidak bisa mengubah akses akun; superadmin tidak bisa mengubah stok.
- Payload actor/role/stock dari client ditolak; status 401/403/404 konsisten.

Halaman login dan ruang kerja memakai auth tahap 03. Server memeriksa session serta izin setiap halaman sebelum menampilkan ruang kerja. Menu dan halaman modul menggunakan permission map yang sama. Modul yang dijadwalkan pada tahap berikutnya menampilkan status belum tersedia.

Guard bisnis, scope pemilik permintaan, dan kuota per akun diuji melalui server HTTP fixture dengan session Better Auth dan PostgreSQL. Endpoint katalog, transaksi, dan administrasi tersedia pada tahap masing-masing. Konfigurasi Next development mempertahankan `AGENTS.md` yang dikelola repo.

## Tahap 05 — Katalog

Status: DONE | Commit: `52bce21`

**Kerja**
- List/search/pagination katalog dan form create/edit gudang.
- Kode unik ternormalisasi; nama, satuan, lokasi wajib; stock selalu nol saat create.
- Batasi edit kode/satuan setelah ada histori; tidak ada route edit stock/delete.
- Service + DTO yang dapat dipakai Server Components dan Route Handlers tanpa self-fetch.

**Gate**
- AC04 dan batas validasi metadata; akses role benar; saldo tidak dapat diubah melalui patch tambahan.
- Tabel usable di desktop/ponsel; tanggal/angka konsisten bahasa Indonesia.

Katalog mendukung pencarian literal kode/nama tanpa membedakan huruf besar dan kecil, pengurutan kode/nama/stok, dan pagination. Semua role dapat membaca katalog. Form tambah dan edit menggunakan Route Handler yang hanya mengizinkan petugas gudang. PostgreSQL memberi stok awal nol dan mencegah kode ganda setelah normalisasi, sementara identitas pembuat berasal dari session.

Edit kode atau satuan mengunci baris barang terlebih dahulu, lalu memeriksa histori permintaan dan mutasi dalam transaksi. Nama dan lokasi tetap bisa diedit. Tes HTTP menggunakan koneksi PostgreSQL independen untuk memverifikasi pembuatan dengan kode yang sama dan edit yang berlangsung bersamaan dengan penyimpanan histori.

## Tahap 06 — Penerimaan dan kartu stok masuk

Status: DONE | Commit: `f2b9d82`

**1. Kontrak dan validasi**

- Pakai tabel `GoodsReceipt`, `Item`, dan `StockMovement` beserta constraint migrasi tahap 02. Tambahkan service `receiving` dan read service `inventory` dengan DTO allowlist. Identitas penerima dan pelaku mutasi berasal dari principal.
- `POST /api/receipts` memakai `receipt:create`, guard HTTP tahap 04, dan header `Idempotency-Key` berupa UUID. Body menerima `itemId`, `quantity`, `receivedOn`, `sourceName`, `deliveryNoteRef`, dan `notes`. Tolak field tambahan dan jumlah yang bukan integer JSON antara 1 dan 1.000.000.
- Validasi `receivedOn` sebagai tanggal kalender `YYYY-MM-DD` sampai hari ini di Asia/Jakarta. Form mengisi default tanggal WIB. Rapikan spasi di ujung teks dan normalkan field opsional kosong menjadi `null`. Batas usulan untuk asal barang, surat jalan, dan catatan adalah 120, 120, dan 500 karakter.
- `GET /api/receipts` memakai `receipt:read`. `GET /api/movements` memakai `movement:read`. Petugas gudang dan superadmin dapat membaca keduanya. Pagination memakai default 20 dan maksimum 100, serta filter barang dan tanggal. Filter tanggal riwayat penerimaan memakai tanggal dokumen, sedangkan kartu stok memakai tanggal posting WIB.

**2. Transaksi penerimaan**

- Hitung SHA-256 dari enam field payload yang sudah dinormalisasi dalam urutan tetap. Cari receipt berdasarkan pasangan pelaku dan key. Key dan hash yang cocok menghasilkan `200` dengan receipt awal. Hash berbeda untuk key yang sama menghasilkan `409`. Barang yang dipilih harus ada dan saldo hasil penambahan maksimal 2.000.000.000.
- Gunakan satu transaksi pendek `ReadCommitted`. Cek replay, ambil lock item `FOR UPDATE` dengan SQL terparameterisasi, lalu cek ulang replay dan baca saldo terkini. Buat receipt, tambah saldo, dan tulis satu `StockMovement` berarah `IN` yang merujuk receipt, barang, jumlah, pelaku dan `balanceAfter`. Commit penerimaan baru menghasilkan `201`.
- Jika dua transaksi berlomba pada unique constraint `(received_by, idempotency_key)`, biarkan transaksi yang gagal rollback, lalu baca hasil yang sudah committed untuk menentukan replay atau konflik. Uji juga ketika payload memakai item berbeda. Buat nomor penerimaan unik di server. Nomor surat jalan boleh berulang.
- Simpan `receivedOn` sebagai `DATE` dan waktu posting sebagai timestamp UTC yang diambil sesudah lock. Urutkan kartu stok berdasarkan ID sequence numerik di database dan serialisasikan ID sebagai string dalam DTO. Tanggal dokumen yang lebih lama tetap muncul pada posisi sesuai urutan posting.

**3. UI dan seed**

- Isi halaman `/penerimaan` dengan riwayat dan tautan ke form `/penerimaan/baru` khusus petugas. Gunakan pencarian katalog untuk memilih satu item, tampilkan satuan, dan pertahankan key yang sama untuk retry pengiriman payload yang sama. Tampilkan hasil simpan, konflik, validasi, sesi kedaluwarsa, dan waktu tunggu `429`.
- Isi `/kartu-stok` dengan mutasi masuk, nomor referensi, tanggal dokumen, waktu posting WIB, jumlah, pelaku, dan saldo setelah mutasi. Pakai read service langsung dari Server Components dan pertahankan tampilan yang dapat dipakai di ponsel. Alur mutasi keluar dilengkapi pada tahap 08.
- Perluas seed demo opt-in dengan barang stok nol dan satu penerimaan melalui service yang sama. Pakai key dan payload demo tetap supaya menjalankan ulang seed tidak menambah saldo atau mutasi lagi. Perbarui README dengan kontrak API, langkah demo, dan bukti tes.

**Gate**

- AC05–AC07. Uji HTTP untuk validasi jumlah dan tanggal, batas saldo, role dan origin, field saldo atau pelaku palsu, receipt baru `201`, replay `200`, konflik `409`, serta surat jalan sama pada penerimaan berbeda.
- AC06. Gunakan request dan koneksi PostgreSQL independen untuk membuktikan bahwa retry paralel dengan key setara menghasilkan satu receipt, satu mutasi `IN`, dan satu penambahan saldo. Dua penerimaan valid dengan key berbeda pada item sama harus tercatat dua kali dengan saldo berurutan.
- AC15. Picu kegagalan terkontrol saat insert mutasi di PostgreSQL tes setelah saldo diperbarui. Pastikan saldo, receipt, dan ledger kembali ke keadaan awal. Jalankan ulang seed demo dan verifikasi hanya ada satu dampak stok.
- AC22. Posting penerimaan bertanggal dokumen lebih lama setelah penerimaan sebelumnya. Verifikasi urutan sequence, `balanceAfter`, dan rekonsiliasi saldo. Uji tampilan browser untuk penerimaan, kartu stok, dan akses baca superadmin. Jalankan lint, typecheck, unit, integration, e2e, serta production build sebelum menutup tahap. Serahkan perubahan unstaged.

Tes HTTP produksi membuktikan retry dengan satu key, dua penerimaan sah dengan key berbeda, dan konflik unique key pada barang berbeda ketika transaksi berjalan paralel. Kegagalan insert ledger setelah update stok membatalkan penerimaan dan saldo. Tes browser memverifikasi pemakaian ulang key sesudah respons sementara `503`, kartu stok pada lebar 390 piksel, dan akses baca superadmin. Seed yang diulang mempertahankan satu penerimaan demo sebesar 25 RIM.

## Tahap 07 — Permintaan karyawan

Status: DONE | Commit: `dd74d7d`

**Kerja**
- Form satu barang + qty, idempotency key, nomor request, status PENDING.
- Submit tidak mengurangi/reserve stok; stok rendah ditampilkan sebagai informasi.
- List/detail employee hanya milik sendiri; antrean warehouse dan view read-only superadmin.
- Filter status/pagination dan safe DTO; pemilik berasal principal.

**Gate**
- AC05, AC07–AC09; IDOR dan forged requester diuji lewat HTTP langsung.
- Duplicate submit key sama tidak membuat request tambahan; logout/login tidak menghilangkan data.

Karyawan memakai form pencarian katalog dan riwayat **Permintaan Saya**. API dan halaman menerapkan scope pemilik pada daftar, jumlah hasil, dan pencarian detail. Gudang dan superadmin mendapat akses baca ke antrean. Pengajuan berstatus `PENDING` dan bisa disimpan saat stok nol atau kurang.

Tes HTTP membuktikan bahwa dua koneksi PostgreSQL yang bersaing dengan key sama menghasilkan satu pengajuan. Tes juga membuktikan konflik payload, isolasi antarpegawai, dan saldo serta mutasi yang tetap sama saat pengajuan. Playwright memverifikasi peringatan stok, pemakaian ulang key setelah `429`, filter status, dan akses sesudah login ulang.

## Tahap 08 — Approval, rejection, dan concurrency gate

Status: DONE | Commit: `8da6fbf`

**Kerja**
- Approval lock request lalu item, cek state+stok terbaru, update saldo, satu OUT dan decision dalam satu transaksi.
- Rejection lock request; simpan alasan dan metadata tanpa stok/ledger change.
- Replay terminal decision mengikuti tabel PRD §8.4; tidak mengubah decider/alasan awal saat replay.
- Parameterized row locks, transaction client yang sama dan unique request source; tidak ada network call dalam transaksi.
- Selesaikan kartu stok masuk/keluar dengan posting sequence dan balance_after.

**Gate wajib sebelum P1**
- AC10–AC16 dan AC22 memakai PostgreSQL nyata serta koneksi independen.
- Stok 10 dua request 7: satu approved, saldo 3; approve request sama: satu OUT; approve vs reject: satu terminal state.
- Inject failure membuktikan rollback; penerimaan bersamaan approval tidak merusak ledger.

Endpoint keputusan memakai izin `request:decide` dan kuota `write` serta `decision`. Persetujuan mengambil lock permintaan lalu lock barang yang juga dipakai penerimaan. Replay mengembalikan metadata keputusan awal. Kartu stok menampilkan kedua arah dan mendukung filter arah serta rentang tanggal posting WIB.

Tes HTTP dengan koneksi PostgreSQL independen mengamati kedua transaksi menunggu lock sebelum memeriksa keputusan, jumlah mutasi, dan saldo. Tes menyuntikkan kegagalan insert `OUT` setelah pengurangan stok. Penerimaan bertanggal mundur yang berjalan bersama approval menghasilkan saldo yang cocok dengan total `IN` dikurangi `OUT` dan urutan `balanceAfter`. Browser memverifikasi dialog persetujuan, penolakan dengan alasan, dan filter arah mutasi pada lebar 390 piksel.

## Tahap 09 — Superadmin terbatas dan verifikasi security menyeluruh

Status: DONE | Commit: menunggu review pemilik repo

**Kerja**
- UI daftar akun, perubahan role/status, revoke sessions, safe audit; account creation UI di luar scope.
- Serialisasi access change dengan advisory lock; recheck actor/target setelah lock; blok self edit dan kehilangan last active superadmin.
- Commit role/status + revoke sessions + audit bersama; periksa efek pada request berikutnya dan test dua browser.
- Review auth catch-all, kemungkinan default profile endpoint, origin handling, forwarded IP dan cache leakage.
- Uji limiter lintas proses, restart dan window reset; sediakan cleanup CLI. Counter storage failure tidak fail-open.
- Selesaikan AC17–AC21 dan UI 429/session expired; hindari rate limit palsu berbasis disable tombol saja.

**Gate**
- Tidak ada path privilege escalation atau auth/rate bypass. Seluruh P0 tetap lolos.
- Jika scope P1 harus ditunda, catat tepat fitur UI yang belum dibuat; keamanan P0 tidak ditunda.

Halaman Akun dan Audit menyediakan perubahan akses, pencabutan sesi, dan riwayat dengan DTO allowlist. Advisory lock dan pemeriksaan ulang pelaku diterapkan pada kedua mutasi. Tes HTTP lintas proses membuktikan satu superadmin tetap aktif dan kegagalan pencatatan audit membatalkan perubahan akun dan sesi.

Regresi AC17–AC21 mencakup kuota lintas proses dan restart, pergantian window, batas origin dan body, spoofed IP, data persisten, pembatasan operasi superadmin, dan `503` saat penyimpanan limiter gagal. CLI cleanup diuji terhadap bucket aktif dan kedaluwarsa. Dua konteks Chromium memverifikasi perubahan role, akses setelah login ulang, pencabutan manual, audit, serta pesan `429`. Uji HTTPS dengan proxy Nginx aktual tercakup tahap 10.

## Tahap 10 — QA, deployment/demo dan pengumpulan

Status: DONE | Commit aktual: —

**Kerja**
- Jalankan lint/typecheck/unit/integration/e2e/build; browser QA tiga role dan seluruh alur inti.
- Uji clean clone/unzip, setup, migration deploy, seed opt-in, restart dan persistensi volume.
- Jika deploy: Nginx HTTPS, trusted proxy, Node privat, DB privat, persistent storage, migrasi manual terkontrol dan environment production terpisah.
- Verifikasi login dan limiter setelah proxy nyata, private no-store serta penggunaan timezone Asia/Jakarta.
- Perbarui README dengan script/versi/URL/video aktual, keterbatasan, hasil cek, dan instruksi akun evaluator melalui saluran pengumpulan.
- Buat ZIP source aplikasi tanpa secrets/build/dependencies; cek isi ZIP dan ekstrak ulang untuk smoke test.
- Sediakan URL + akun jika deployed, atau video demo jika tidak. Jangan menyebut ZIP dokumen ini sebagai source aplikasi.

**Gate**
- Semua kebutuhan wajib PDF terpetakan ke acceptance criteria dan bukti demonstrasi.
- Tidak ada checkbox lulus atau hasil deploy yang direkayasa. Pengumpulan final dilakukan melalui destination yang diberikan user.

### Pemetaan bukti Tahap 10

| Kebutuhan | AC | Verifikasi |
| --- | --- | --- |
| Login/logout, signup tertutup, status dan role terkini | AC01–AC03 | [HTTP auth](tests/integration/auth-http.test.ts), [HTTP admin](tests/integration/admin-http.test.ts), [browser tiga role](tests/e2e/home.spec.ts), [pencabutan sesi dari browser](tests/e2e/admin.spec.ts). Demo menampilkan logout, riwayat setelah login ulang, dan audit pencabutan sesi. |
| Katalog stok nol, jumlah valid, penerimaan dan retry | AC04–AC07 | [HTTP katalog](tests/integration/catalog-http.test.ts), [HTTP penerimaan](tests/integration/receiving-http.test.ts), [validasi pengajuan](tests/integration/requisitions-http.test.ts). Demo menampilkan pembuatan barang, edit rak, dan penerimaan 10 unit. |
| Pengajuan Menunggu tanpa reservasi dan akses pemilik | AC08–AC09 | [HTTP pengajuan](tests/integration/requisitions-http.test.ts), [akses HTTP bisnis](tests/integration/business-http.test.ts). Demo menampilkan pengajuan 7 unit dan stok tetap 10. |
| Persetujuan, penolakan, konkurensi, dan rollback | AC10–AC16 | [HTTP keputusan dengan PostgreSQL](tests/integration/decisions-http.test.ts), [rollback penerimaan](tests/integration/receiving-http.test.ts). Demo menampilkan saldo 3 dan satu transaksi keluar, stok kurang, serta penolakan dengan saldo tetap. |
| Kuota bersama, spoofing header, origin, dan body | AC17–AC19 | [HTTP auth](tests/integration/auth-http.test.ts), [HTTP bisnis](tests/integration/business-http.test.ts), [HTTP admin](tests/integration/admin-http.test.ts). |
| Persistensi, batas superadmin, dan urutan kartu stok | AC20–AC22 | [Restart proses dan batas admin](tests/integration/admin-http.test.ts), [skenario kartu stok](tests/integration/receiving-http.test.ts), [penerimaan dan persetujuan paralel](tests/integration/decisions-http.test.ts), smoke dari hasil ekstrak ZIP. Demo menampilkan riwayat dan waktu posting WIB. |

Verifikasi 28 November 2026 menggunakan Node.js 24.22.3, npm 11.19.1, PostgreSQL 17.11, dan basis kode `d8dc1df`. `lint`, `typecheck`, `test:unit` (103), `test:integration` (87), `build`, dan satu suite `test:e2e` penuh (10) lulus. Server Next yang dimulai oleh Playwright perlu dihentikan setelah seluruh tes selesai agar proses mengeluarkan ringkasan.

Dari ekstraksi source baru, `npm ci` memasang 732 paket dari cache lokal dan menggunakan engine Prisma resmi yang sudah tersedia. Migrasi pertama berhasil dan migrasi kedua tidak memiliki pekerjaan tertunda. Seed tanpa opt-in dilewati. Dua seed opt-in menghasilkan total tiga akun, satu penerimaan, dan stok 25 untuk barang seed. Smoke HTTP membuat barang terpisah dan membuktikan saldo 0 → 10 → 3, satu mutasi masuk dan satu mutasi keluar, dan sesi logout ditolak. Setelah proses Next dan PostgreSQL dihidupkan ulang dengan direktori data yang sama, ketiga role bisa login dan membaca data sesuai izin.

`docker compose config --quiet` lulus. Persistensi diuji dengan PostgreSQL portabel karena daemon Docker Windows tidak tersedia. Driver `pg` masih mengeluarkan peringatan deprecation pada beberapa operasi. Demo menggunakan aplikasi lokal dan data contoh.

Rekaman browser dirender dengan Remotion menjadi `papi-warehouse-demo.mp4` (H.264) dan `papi-warehouse-demo.webm` (VP9). Metadata dan 2.703 frame pada masing-masing video berhasil dibaca, dengan durasi sekitar 1 menit 53 detik. `papi-warehouse-source.zip` diperiksa lewat manifest dan ekstraksi ulang 133 file. Hasil ekstrak melewati build dan smoke setelah restart. Pembaruan laporan akhir hanya mengubah dokumentasi. Semua berkas pengumpulan tersedia terpisah di `tmp/submission/` dan siap untuk diunggah.

### Revisi antarmuka Warehouse Testing

- Beranda publik menyediakan panduan tiap peran, FAQ, video WebM dengan cadangan MP4, dan tautan Masuk. Bagian Kontak mengambil nilai dari konfigurasi yang diisi pengelola. Tujuan setelah login adalah `/ruang-kerja`.
- Layout filter Kartu Stok dan Penerimaan memisahkan pencarian, rentang tanggal, dan tindakan. Spasi di navigasi, Katalog, dan Permintaan diselaraskan untuk desktop dan ponsel.
- Indikator dan panel diagnostik Next disembunyikan pada UI. Halaman gagal menyediakan pesan umum dan tombol **Coba lagi**. Form transaksi menampilkan pesan umum untuk kegagalan server, dan tombol masuk aktif ketika form siap menangani pengiriman.

Verifikasi revisi meluluskan lint, typecheck, build dari ekstrak source, 103 unit test, dan 87 tes integrasi. Sepuluh skenario browser regresi lulus pada suite penuh. Dua tes beranda lulus pada pengujian terarah setelah penyesuaian selektor FAQ dan simulasi bundle yang tertunda. Browser memuat WebM di desktop dan ponsel. Saat PostgreSQL tes dihentikan, Kartu Stok menampilkan fallback tanpa rincian teknis. Tombol **Coba lagi** memulihkan halaman setelah PostgreSQL dinyalakan kembali. Revisi ZIP pengumpulan berisi 142 file termasuk aset demo beranda.

## Log eksekusi

| Tahap | Status | Commit aktual | Command/bukti | Batasan |
| --- | --- | --- | --- | --- |
| 01 | DONE | `chore: bootstrap next warehouse application` | `npm ci --no-audit --no-fund`, `db:generate`, `auth:generate`, `prisma validate`, `lint`, `typecheck`, `build`, `test:unit` (4), `test:integration` (2), `test:e2e` (1), dan `docker compose config --quiet` berhasil. | PostgreSQL 17.11 portabel digunakan pada database terpisah. Engine Docker lokal belum tersedia untuk menjalankan container Compose. |
| 02 | DONE | `5a9cdc2` | `auth:generate`, `prisma validate`, `db:generate`, `db:migrate -- --create-only --name init_warehouse`, `db:migrate:deploy` dua kali, `prisma migrate status`, `lint`, `typecheck`, `build`, `test:unit` (4), `test:integration` (37), dan `test:e2e` (1) berhasil. | Migrasi dan seed diuji pada PostgreSQL 17.11 portabel di database terpisah. Database aplikasi tetap utuh. Perubahan diserahkan unstaged. |
| 03 | DONE | `df68190` | `db:migrate:deploy` di database tes, `lint`, `typecheck`, `next build --webpack`, `test:unit` (15), `test:integration` (46), `test:e2e` (1), dan smoke login HTTP development di loopback berhasil. | Tes HTTP memakai PostgreSQL 17.11 portabel dan upstream Next.js loopback. Webpack dipakai setelah error source map Turbopack di Windows. Perubahan diserahkan unstaged. |
| 04 | DONE | `209a78a` | `db:migrate:deploy` pada database tes, `lint`, `typecheck`, `build`, `test:unit` (32), `test:integration` (52), dan `test:e2e` (5) berhasil. | Playwright memakai Next development pada loopback. Tes RBAC bisnis memakai HTTP fixture dan PostgreSQL 17.11 portabel. Perubahan diserahkan unstaged. |
| 05 | DONE | `52bce21` | `db:migrate:deploy` pada dua database tes, `lint`, `typecheck`, `build`, `test:unit` (50), `test:integration` (59), dan `test:e2e` (6) berhasil. | Integrasi dan Playwright memakai database PostgreSQL 17.11 portabel terpisah. Playwright memakai Next development pada loopback. Perubahan diserahkan unstaged. |
| 06 | DONE | `f2b9d82` | `db:migrate:deploy` pada dua database tes, `lint`, `typecheck`, `build`, `test:unit` (69), `test:integration` (67), dan `test:e2e` (8) berhasil. | Integrasi dan Playwright memakai database PostgreSQL 17.11 portabel terpisah. Browser mencatat satu peringatan deprecation dari driver `pg` tentang query yang masih berjalan. Seluruh tes lulus dan perubahan diserahkan unstaged. |
| 07 | DONE | `dd74d7d` | `db:migrate:deploy` pada dua database tes, `lint`, `typecheck`, `build`, `test:unit` (84), `test:integration` (73), dan `test:e2e` (9) berhasil. | Integrasi dan Playwright memakai database PostgreSQL 17.11 portabel terpisah. Regresi browser penerimaan kembali mencatat peringatan deprecation driver `pg`. Perubahan diserahkan unstaged. |
| 08 | DONE | `8da6fbf` | `db:migrate:deploy` pada dua database tes, `lint`, `typecheck`, `build`, `test:unit` (95), `test:integration` (81), dan `test:e2e` (9) berhasil. | Integrasi dan Playwright memakai database PostgreSQL 17.11 portabel terpisah. Playwright kembali mencatat peringatan deprecation driver `pg` tentang query yang masih berjalan. Perubahan diserahkan unstaged. |
| 09 | DONE | — | `db:migrate:deploy`, `lint`, `typecheck`, `build`, `test:unit` (103), `test:integration` (87), dan 10 skenario browser. `test:e2e` meluluskan 8 skenario saat percobaan awal. Dua skenario yang tersisa lulus lewat `test:e2e -- --grep 'perubahan akses\|WAREHOUSE masuk'` setelah kompilasi route admin dilakukan sebelumnya dan penantian logout disesuaikan. | PostgreSQL 17.11 portabel pada dua database tes terpisah. Next development memuat ulang pada percobaan awal, dan driver `pg` masih mencatat peringatan deprecation pada regresi. Perubahan diserahkan unstaged. |
| 10 | DONE | — | `npm ci`, `db:migrate:deploy` dua kali, seed tanpa opt-in dan dua kali dengan opt-in, `lint`, `typecheck`, `test:unit` (103), `test:integration` (87), `test:e2e` (10), `build`, smoke restart, `docker compose config --quiet`, verifikasi ZIP dan video MP4/WebM. | PostgreSQL 17.11 portabel, demo lokal, dan peringatan `pg` dicatat di atas. Perubahan diserahkan unstaged. |
