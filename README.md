# Warehouse Office Supplies

Aplikasi katalog dan stok perlengkapan kantor untuk satu gudang. Karyawan mengajukan permintaan; petugas mencatat penerimaan dan memutuskan permintaan. Stok berkurang hanya setelah persetujuan berhasil.

Proyek menyediakan halaman login, ruang kerja dengan navigasi sesuai role, schema PostgreSQL, dan CLI seed. Fitur operasional tersedia bertahap mulai dari katalog pada tahap 05. [Log eksekusi](PLAN.md#log-eksekusi)

## Dokumen

| File | Kegunaan |
| --- | --- |
| [PRD.md](PRD.md) | Scope, alur bisnis, data, API, akses, keamanan, acceptance criteria |
| [PLAN.md](PLAN.md) | Sepuluh tahap implementasi dan log verifikasi |
| [AGENTS.md](AGENTS.md) | Aturan bagi agent yang mengimplementasikan repository |

Deadline pengumpulan **28 November 2026, pukul 23.59 WIB**. Pengumpulan berupa source ZIP melalui Google Drive, disertai URL dan akun akses jika deployed, atau video demo. [PDF soal](PAPI%20-%20Tes%2026112026.pdf)

## Keputusan arsitektur

**Modular monolith dengan Next.js App Router, React, dan TypeScript.** Next.js menangani UI sekaligus backend. React adalah library UI yang digunakan Next.js, bukan frontend service tambahan.

Modul: Identity & Access, Catalog, Receiving, Requisitions, Inventory, Audit. Modul memiliki batas tanggung jawab di kode, tetapi berjalan dalam satu aplikasi dan satu PostgreSQL. Tidak ada microservice per role.

Persetujuan, perubahan saldo, dan mutasi keluar harus commit atau rollback bersama. Pemisahan proses ini menjadi service berbeda belum memberi manfaat yang sebanding dengan tambahan koordinasi transaksi untuk scope tes.

| Komponen | Pilihan |
| --- | --- |
| Framework | Next.js App Router, Node.js runtime |
| UI | React, TypeScript strict, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL 17 untuk baseline lokal/deployment |
| ORM | Prisma 7, PostgreSQL driver adapter yang kompatibel |
| Authentication | Better Auth, email/password, Prisma adapter |
| Session | Database-backed; cookie HttpOnly; tanpa JWT di localStorage |
| RBAC | Tiga role tetap, permission map di server + ownership check |
| Validation | Zod di boundary backend; feedback frontend memakai schema yang relevan |
| Rate limit | Counter PostgreSQL atomik; guard transport aplikasi dan auth |
| Test | Vitest untuk unit/integrasi, Playwright untuk alur browser |
| Deployment | Satu proses Node di balik Nginx HTTPS; PostgreSQL persisten |
| Package manager | npm, satu `package-lock.json` |

Versi tahap 01 dikunci di `package.json` dan `package-lock.json`.

| Komponen | Versi |
| --- | --- |
| Node.js dan npm | 24.22.3 LTS dan 11.19.1 |
| Next.js, React, dan TypeScript | 16.4.6, 19.3.1, dan 5.9.3 |
| Tailwind CSS dan shadcn/ui CLI | 4.3.5 dan 4.23.1 |
| Prisma, Prisma Client, dan adapter PostgreSQL | 7.10.1 |
| Better Auth, Prisma adapter, dan CLI | 1.7.28 |
| Zod | 4.6.7 |
| Vitest dan Playwright | 5.1.2 dan 1.65.1 |
| ESLint dan preset Next.js | 9.39.4 dan 16.4.6 |
| PostgreSQL | 17 (`postgres:17` pada Compose) |

## Role

| Role | Tugas |
| --- | --- |
| `EMPLOYEE` | Katalog, membuat permintaan satu barang, melihat permintaan sendiri |
| `WAREHOUSE` | Katalog, penerimaan, semua permintaan, approval/rejection, kartu stok |
| `SUPERADMIN` | Katalog read-only, audit operasional read-only, daftar akun, perubahan role/status, pencabutan session |

Superadmin tidak otomatis mewarisi operasi gudang. Tidak ada public signup. Pembuatan akun awal melalui seed/CLI operator; UI pembuatan akun, reset password via email, dan permission builder di luar MVP. Auth HTTP hanya membuka get-session, sign-in email dan sign-out yang diperlukan; endpoint profil/password/plugin lain tidak dibuka pada MVP.

## Alur penting

1. Barang baru selalu mempunyai saldo nol.
2. Penerimaan menyimpan jumlah positif, asal barang, tanggal, dan referensi surat jalan opsional; saldo dan mutasi masuk tersimpan dalam satu transaksi.
3. Permintaan karyawan berisi satu barang dan jumlah positif. Status awal `PENDING`; belum mengurangi atau mereservasi stok.
4. Approval mengunci permintaan lalu barang, membaca kondisi terkini, mengurangi stok, membuat satu mutasi keluar, dan menetapkan `APPROVED` secara atomik.
5. Stok kurang menyebabkan seluruh approval gagal; status tetap `PENDING`.
6. Rejection hanya mengubah status dan menyimpan alasan; tidak mengubah stok.

Permintaan dan penerimaan yang berhasil dibuat tidak diedit/dihapus melalui MVP. Perubahan saldo tidak tersedia pada form edit barang. Koreksi stok membutuhkan fitur adjustment terpisah pada fase berikutnya.

## Struktur kode yang dituju

| Path | Isi |
| --- | --- |
| `src/app/` | Halaman, layout, Route Handlers; entry point tipis |
| `src/app/api/auth/[...all]/route.ts` | Handler Better Auth dengan guard transport |
| `src/app/api/items/` | Endpoint katalog |
| `src/app/api/receipts/` | Endpoint penerimaan |
| `src/app/api/requests/` | Endpoint permintaan dan keputusan |
| `src/app/api/admin/users/` | Endpoint akses akun |
| `src/modules/<domain>/` | Service, repository, schema, DTO per domain |
| `src/lib/auth.ts` | Konfigurasi Better Auth server-only |
| `src/lib/authorization.ts` | Principal, permission map, ownership helper |
| `src/lib/rate-limit.ts` | Counter PostgreSQL dan kebijakan limit |
| `src/lib/db.ts` | Prisma client + adapter, hanya server |
| `prisma/` | Schema, migrasi termasuk SQL constraint, seed |
| `tests/integration/` | Integrasi dengan PostgreSQL nyata |
| `tests/e2e/` | Pengujian browser dengan akun role berbeda |

Server Components membaca data melalui service/DAL langsung; tidak memanggil HTTP API internal sendiri. Mutation dari browser memakai Route Handlers. Jangan menambahkan Server Action yang menduplikasi mutation tanpa guard yang sama.

## Setup lokal

Gunakan Node.js dan npm yang tercatat di atas. Jalankan perintah berikut dari root proyek via PowerShell.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --wait db
npm run db:migrate:deploy
npm run dev
```

Compose menerbitkan PostgreSQL 17 pada `127.0.0.1:5433` dan menyimpan data dalam volume `postgres_data`. Jika memakai PostgreSQL 17 UTF-8 yang sudah berjalan, arahkan `DATABASE_URL` ke database proyek tersebut sebelum menjalankan migrasi. Masuk dengan akun yang dibuat melalui seed. [Halaman login lokal](http://localhost:3000/login)

`dev` dan `build` memakai Webpack karena build jalur auth memicu error source map Turbopack pada lingkungan Windows yang diuji.

Jika `.env` disalin dari contoh, buat dua secret independen dengan menjalankan `node -p "require('node:crypto').randomBytes(32).toString('hex')"` dua kali. Simpan satu hasil ke `BETTER_AUTH_SECRET` dan satu lagi ke `RATE_LIMIT_KEY_SECRET`. Jika mengubah password atau port Compose, sesuaikan `DATABASE_URL`.

| Environment variable | Tujuan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL server-only |
| `TEST_DATABASE_URL` | Koneksi PostgreSQL 17 khusus tes dengan nama `warehouse_test` atau `warehouse_test_<suffix>` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Pengaturan Compose lokal |
| `BETTER_AUTH_SECRET` | Secret acak kuat, minimal sesuai persyaratan library |
| `BETTER_AUTH_URL` | Origin aplikasi, HTTPS pada production |
| `APP_ORIGIN` | Satu origin sah untuk mutation; harus konsisten dengan URL auth |
| `RATE_LIMIT_KEY_SECRET` | Secret HMAC untuk limiter auth berbasis IP dan limiter bisnis berbasis akun |
| `TRUSTED_PROXY_MODE` | `direct` lokal atau `nginx` pada deployment yang sesuai |
| `TRUSTED_PROXY_SECRET` | Secret 64 digit hex yang dibagikan dengan Nginx dalam mode `nginx` |
| `SEED_DEMO_ENABLED` | Set `true` untuk mengizinkan pembuatan akun demo |
| `SEED_EMPLOYEE_EMAIL`, `SEED_EMPLOYEE_PASSWORD` | Akun demo karyawan |
| `SEED_WAREHOUSE_EMAIL`, `SEED_WAREHOUSE_PASSWORD` | Akun demo gudang |
| `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD` | Akun demo administrator |

### Migrasi dan akun demo

`npm run db:migrate:deploy` menerapkan migrasi yang tersedia. Gunakan `npm run db:migrate` saat mengembangkan perubahan schema baru dan `npm run db:generate` untuk membuat ulang Prisma Client. Koneksi Prisma menggunakan zona waktu UTC. `received_on` memakai tipe PostgreSQL `DATE` untuk tanggal dokumen di WIB.

Untuk menyiapkan akun demo lokal, set `SEED_DEMO_ENABLED=true` dan isi ketiga pasangan email/password di `.env` setelah migrasi. Gunakan email berbeda untuk masing-masing role dan password 8–128 karakter. Jalankan `npm run db:seed` dari root proyek. Seed menyimpan hash Better Auth dan melewati akun dengan email yang sudah ada. Seed transaksi stok dijadwalkan setelah penerimaan tersedia pada tahap 06.

### Endpoint auth

| Method dan path | Kontrak |
| --- | --- |
| `POST /api/auth/sign-in/email` | JSON berisi `email` dan `password`. Respons sukses memuat profil pengguna dan mengirim cookie session. |
| `GET /api/auth/get-session` | Mengembalikan profil dan waktu kedaluwarsa session, atau `null` jika session sudah tidak berlaku. |
| `POST /api/auth/sign-out` | Body kosong atau `{}`. Mencabut session di database dan menghapus cookie. |

Request POST memerlukan `Origin` yang sama dengan `APP_ORIGIN`. Set `BETTER_AUTH_URL` ke origin yang sama. Gunakan `npm run dev` untuk HTTP loopback. Auth pada build produksi memerlukan origin HTTPS. Setiap session berlaku delapan jam sejak dibuat. Respons `429` menyertakan `Retry-After` dalam detik.

### Ruang kerja dan izin

Ruang kerja memeriksa session dan izin di server pada setiap halaman. Karyawan melihat menu Katalog dan Permintaan Saya. Petugas gudang melihat Katalog, Penerimaan, Permintaan, dan Kartu Stok. Superadmin mendapat area baca untuk operasi gudang serta menu Akun dan Audit. Halaman yang modulnya masih dijadwalkan menampilkan status belum tersedia.

`withBusinessHandler()` menggabungkan guard origin, session, izin, validasi JSON, dan kuota PostgreSQL. Gunakan helper ini mulai dari endpoint katalog tahap 05. Repository permintaan menyediakan scope pemilik untuk daftar dan detail yang dipakai pada tahap 07.

## Pemeriksaan tahap 04

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:integration
npx playwright install chromium --only-shell
npm run test:e2e
```

Untuk tes integrasi pada Compose, buat database terpisah dengan `docker compose exec db createdb -U warehouse warehouse_test` lalu isi `TEST_DATABASE_URL` di `.env`. Di terminal khusus tes, jalankan migrasi dengan `DATABASE_URL` yang secara eksplisit menunjuk ke database tes.

```powershell
$env:DATABASE_URL = '<URL PostgreSQL untuk warehouse_test>'
npm run db:migrate:deploy
Remove-Item Env:DATABASE_URL
npm run test:integration
```

Jalankan `npm run build` sebelum tes integrasi. Tes auth menjalankan beberapa proses Next.js untuk memeriksa limiter bersama dan dapat menunggu window berikutnya hingga satu menit. Tes RBAC menggunakan server HTTP fixture dan PostgreSQL untuk memeriksa izin, filter kepemilikan, serta kuota bisnis.

`npm run test:e2e` memakai `TEST_DATABASE_URL` yang sama dan menyalakan Next.js development pada `127.0.0.1:3100`. Playwright menyusun akun fixture sementara untuk menguji login, navigasi, logout, dan sesi kedaluwarsa di browser. Pembersihan bucket rate limit operasional dijadwalkan pada tahap 09.

### Proxy Nginx untuk produksi

Gunakan `TRUSTED_PROXY_MODE=nginx` dan buat `TRUSTED_PROXY_SECRET` dengan perintah pembuat secret 64 digit hex di atas. Jalankan `npm run start` pada loopback dan gunakan blok berikut pada virtual host HTTPS yang memiliki origin sesuai konfigurasi aplikasi.

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Forwarded "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header X-Real-IP "";
    proxy_set_header X-Warehouse-Verified-IP "";
    proxy_set_header X-Warehouse-Client-IP $remote_addr;
    include /etc/nginx/snippets/warehouse-proxy-secret.conf;
    client_max_body_size 32k;
}
```

Simpan direktif `proxy_set_header X-Warehouse-Proxy-Token "<secret-proxy>";` di file include privat di server. Gunakan nilai yang sama dengan `TRUSTED_PROXY_SECRET` aplikasi. Mode `direct` dan request dengan bukti proxy yang tidak sah memakai kuota bersama. Konfigurasi virtual host dan TLS divalidasi saat deployment tahap 10.

## Deployment dan pengumpulan

- Jalankan migrasi production melalui script `db:migrate:deploy`; jangan `db push` atau seed demo otomatis saat startup.
- Jalankan Next.js pada interface privat/loopback di balik Nginx HTTPS. Tutup akses publik langsung ke Node dan PostgreSQL.
- Nginx menghapus/mengganti header IP yang dapat dipalsukan klien. Auth dan limiter memakai parser trusted proxy yang sama.
- Private response memakai `Cache-Control: private, no-store`; hindari shared cache data akun, session, permintaan, dan saldo.
- Verifikasi data bertahan setelah proses aplikasi restart dan setelah logout/login.
- Siapkan URL dan akun evaluator melalui saluran pengumpulan. Jangan commit password production/demo deployed ke repository publik.
- ZIP source menyertakan kode, lockfile, migrasi, dokumen, `.env.example`, dan instruksi; mengecualikan `.env`, dump DB, log, `.next`, dan `node_modules`.

| Bukti pengumpulan | Status |
| --- | --- |
| URL aplikasi / video demo | Belum tersedia |
| Kredensial evaluator | Belum dibuat |
| Hasil pengujian | Lihat log eksekusi tahap 01 di `PLAN.md` |
| ZIP source aplikasi | Dijadwalkan pada tahap 10 |

## Referensi teknis

Diakses 26 November 2026. Cocokkan dokumentasi dengan versi package yang dipasang.

- [Next.js authentication dan authorization](https://nextjs.org/docs/app/guides/authentication)
- [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)
- [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management)
- [Better Auth rate limiting](https://www.better-auth.com/docs/concepts/rate-limit)
- [Better Auth Prisma adapter dan batas kompatibilitas](https://www.better-auth.com/docs/adapters/prisma)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html)
