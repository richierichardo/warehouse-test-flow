# Implementation Plan — 10 Tahap

Rencana bertanggal 26 November 2026. Deadline pengumpulan 28 November 2026 pukul 23.59 WIB. Tahap 01–03 sudah diimplementasikan. Tahap 04–10 berstatus `TODO`.

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

Status: DONE | Commit: menunggu review pemilik repo

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

Status: TODO | Commit: `feat: enforce server rbac and role navigation`

**Kerja**
- Permission map tiga role dan helper deny-by-default; ownership employee pada repository query.
- Buat layout/sidebar sesuai role, halaman login, loading/empty/forbidden/session-expired.
- Buat wrapper business handlers: origin, principal, permission, Zod, rate bucket shared, consistent response/error.
- Terapkan read/write/decision/admin bucket sejak route dipakai, bukan sekadar menambahkan UI cooldown.
- Siapkan test akses langsung endpoint dengan session masing-masing role.

**Gate**
- Employee tidak bisa membuat barang/menerima/approve; warehouse tidak bisa mengubah akses akun; superadmin tidak bisa mengubah stok.
- Payload actor/role/stock dari client ditolak; status 401/403/404 konsisten.

## Tahap 05 — Katalog

Status: TODO | Commit: `feat: implement catalog with zero opening stock`

**Kerja**
- List/search/pagination katalog dan form create/edit gudang.
- Kode unik ternormalisasi; nama, satuan, lokasi wajib; stock selalu nol saat create.
- Batasi edit kode/satuan setelah ada histori; tidak ada route edit stock/delete.
- Service + DTO yang dapat dipakai Server Components dan Route Handlers tanpa self-fetch.

**Gate**
- AC04 dan batas validasi metadata; akses role benar; saldo tidak dapat diubah melalui patch tambahan.
- Tabel usable di desktop/ponsel; tanggal/angka konsisten bahasa Indonesia.

## Tahap 06 — Penerimaan dan kartu stok masuk

Status: TODO | Commit: `feat: record idempotent receipts and incoming movements`

**Kerja**
- Form satu barang, qty, received_on, asal barang, surat jalan opsional, catatan.
- Transaksi receiving + lock item + batas saldo + receipt + IN ledger; parameterized SQL untuk row lock.
- Idempotency-Key/payload hash/replay/conflict, termasuk race insert unique dan rollback/re-read.
- Nomor penerimaan unik, tanggal posting UTC dan tanggal dokumen WIB terpisah.
- Riwayat penerimaan dan kartu stok dasar; seed demo penerimaan melalui service yang sama.

**Gate**
- AC05–AC07, bagian AC15 dan AC22; retry paralel menambah stok sekali; surat jalan sama boleh pada beberapa record.
- Backdate tidak merusak urutan balance_after; exception sesudah stock update membatalkan receipt dan ledger.

## Tahap 07 — Permintaan karyawan

Status: TODO | Commit: `feat: add employee requests and ownership isolation`

**Kerja**
- Form satu barang + qty, idempotency key, nomor request, status PENDING.
- Submit tidak mengurangi/reserve stok; stok rendah ditampilkan sebagai informasi.
- List/detail employee hanya milik sendiri; antrean warehouse dan view read-only superadmin.
- Filter status/pagination dan safe DTO; pemilik berasal principal.

**Gate**
- AC05, AC07–AC09; IDOR dan forged requester diuji lewat HTTP langsung.
- Duplicate submit key sama tidak membuat request tambahan; logout/login tidak menghilangkan data.

## Tahap 08 — Approval, rejection, dan concurrency gate

Status: TODO | Commit: `feat: implement atomic stock decisions with concurrency guards`

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

## Tahap 09 — Superadmin terbatas dan verifikasi security menyeluruh

Status: TODO | Commit: `feat: add access administration and verify security boundaries`

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

## Tahap 10 — QA, deployment/demo dan pengumpulan

Status: TODO | Commit: `docs: finalize tested setup demo and submission package`

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

## Log eksekusi

| Tahap | Status | Commit aktual | Command/bukti | Batasan |
| --- | --- | --- | --- | --- |
| 01 | DONE | `chore: bootstrap next warehouse application` | `npm ci --no-audit --no-fund`, `db:generate`, `auth:generate`, `prisma validate`, `lint`, `typecheck`, `build`, `test:unit` (4), `test:integration` (2), `test:e2e` (1), dan `docker compose config --quiet` berhasil. | PostgreSQL 17.11 portabel digunakan pada database terpisah. Engine Docker lokal belum tersedia untuk menjalankan container Compose. |
| 02 | DONE | `5a9cdc2` | `auth:generate`, `prisma validate`, `db:generate`, `db:migrate -- --create-only --name init_warehouse`, `db:migrate:deploy` dua kali, `prisma migrate status`, `lint`, `typecheck`, `build`, `test:unit` (4), `test:integration` (37), dan `test:e2e` (1) berhasil. | Migrasi dan seed diuji pada PostgreSQL 17.11 portabel di database terpisah. Database aplikasi tetap utuh. Perubahan diserahkan unstaged. |
| 03 | DONE | — | `db:migrate:deploy` di database tes, `lint`, `typecheck`, `next build --webpack`, `test:unit` (15), `test:integration` (46), `test:e2e` (1), dan smoke login HTTP development di loopback berhasil. | Tes HTTP memakai PostgreSQL 17.11 portabel dan upstream Next.js loopback. Webpack dipakai setelah error source map Turbopack di Windows. Perubahan diserahkan unstaged. |
| 04 | TODO | — | — | Belum dijalankan |
| 05 | TODO | — | — | Belum dijalankan |
| 06 | TODO | — | — | Belum dijalankan |
| 07 | TODO | — | — | Belum dijalankan |
| 08 | TODO | — | — | Belum dijalankan |
| 09 | TODO | — | — | Belum dijalankan |
| 10 | TODO | — | — | Belum dijalankan |
