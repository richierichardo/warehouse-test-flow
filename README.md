# Warehouse Office Supplies

Aplikasi katalog dan stok perlengkapan kantor untuk satu gudang. Karyawan mengajukan permintaan; petugas mencatat penerimaan dan memutuskan permintaan. Stok berkurang hanya setelah persetujuan berhasil.

Tahap 01 menyediakan fondasi aplikasi dan halaman awal. Schema bisnis, migrasi, dan akun awal dijadwalkan pada tahap 02. Login dan logout dijadwalkan pada tahap 03. Lihat [log eksekusi](PLAN.md#log-eksekusi) untuk hasil verifikasi.

## Dokumen

| File | Kegunaan |
| --- | --- |
| [PRD.md](PRD.md) | Scope, alur bisnis, data, API, akses, keamanan, acceptance criteria |
| [PLAN.md](PLAN.md) | Sepuluh tahap implementasi, satu tahap menjadi satu commit utama |
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

## Setup lokal tahap 01

Gunakan Node.js dan npm yang tercatat di atas. Jalankan perintah berikut dari root proyek via PowerShell.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Buka [halaman awal lokal](http://localhost:3000). Untuk menyalakan PostgreSQL 17, gunakan `docker compose up -d --wait db` saat Docker aktif atau arahkan `DATABASE_URL` ke PostgreSQL 17 lokal. Compose menerbitkan port `5433` di `127.0.0.1` dan menyimpan data dalam volume `postgres_data`.

Jika `.env` disalin dari contoh, buat dua secret independen dengan menjalankan `node -p "require('node:crypto').randomBytes(32).toString('hex')"` dua kali. Simpan satu hasil ke `BETTER_AUTH_SECRET` dan satu lagi ke `RATE_LIMIT_KEY_SECRET`. Jika mengubah password atau port Compose, sesuaikan `DATABASE_URL`.

| Environment variable | Tujuan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL server-only |
| `TEST_DATABASE_URL` | Koneksi PostgreSQL 17 yang terpisah untuk smoke test |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Pengaturan Compose lokal |
| `BETTER_AUTH_SECRET` | Secret acak kuat, minimal sesuai persyaratan library |
| `BETTER_AUTH_URL` | Origin aplikasi, HTTPS pada production |
| `APP_ORIGIN` | Satu origin sah untuk mutation; harus konsisten dengan URL auth |
| `RATE_LIMIT_KEY_SECRET` | Secret HMAC untuk identitas limiter berbasis IP |
| `TRUSTED_PROXY_MODE` | `direct` lokal atau `nginx` pada deployment yang sesuai |
| `SEED_DEMO_ENABLED` | Opt-in eksplisit untuk seed data demo |
| `SEED_EMPLOYEE_EMAIL`, `SEED_EMPLOYEE_PASSWORD` | Akun demo karyawan |
| `SEED_WAREHOUSE_EMAIL`, `SEED_WAREHOUSE_PASSWORD` | Akun demo gudang |
| `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD` | Akun demo administrator |

Jangan memakai prefix `NEXT_PUBLIC_` untuk secret/database. Seed harus idempotent, memakai hashing library auth, dan tidak mengatur ulang password/role akun yang sudah ada secara diam-diam. Reset database harus berupa perintah terpisah yang jelas destructive.

## Pemeriksaan tahap 01

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

Isi `TEST_DATABASE_URL` sebelum menjalankan tes integrasi. Pada Compose dengan pengguna default, buat database tes dengan `docker compose exec db createdb -U warehouse warehouse_test`, lalu gunakan URL yang mengarah ke `warehouse_test`. Smoke test memeriksa koneksi Prisma ke PostgreSQL 17 dan inisialisasi Better Auth dengan adapter Prisma. Playwright menguji build produksi pada port `3100`.

`npm run db:generate` menghasilkan ulang Prisma Client. `db:migrate` dan `db:migrate:deploy` siap untuk migrasi tahap 02. `db:seed` dan `limiter:cleanup` menampilkan tahap saat masing-masing mulai tersedia dan keluar dengan kode `1`.

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
