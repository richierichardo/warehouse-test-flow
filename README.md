# Warehouse Office Supplies

Aplikasi katalog dan stok perlengkapan kantor untuk satu gudang. Karyawan mengajukan permintaan; petugas mencatat penerimaan dan memutuskan permintaan. Stok berkurang hanya setelah persetujuan berhasil.

Proyek menyediakan login, katalog barang, penerimaan, pengajuan karyawan, keputusan petugas, dan kartu stok masuk dan keluar. Superadmin mengelola akses akun dan membaca audit serta riwayat operasional. [Log eksekusi](PLAN.md#log-eksekusi)

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
| `src/app/api/requests/` | Daftar, detail, pembuatan permintaan, persetujuan dan penolakan |
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

Compose menerbitkan PostgreSQL 17 pada `127.0.0.1:5433` dan menyimpan data dalam volume `postgres_data`. Jika memakai PostgreSQL 17 UTF-8 yang sudah berjalan, arahkan `DATABASE_URL` ke database proyek tersebut sebelum menjalankan migrasi. Buka beranda lalu masuk dengan akun yang dibuat melalui seed. [Beranda lokal](http://localhost:3000/)

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
| `SEED_DEMO_ENABLED` | Set `true` untuk membuat akun dan satu penerimaan demo |
| `SEED_EMPLOYEE_EMAIL`, `SEED_EMPLOYEE_PASSWORD` | Akun demo karyawan |
| `SEED_WAREHOUSE_EMAIL`, `SEED_WAREHOUSE_PASSWORD` | Akun demo gudang |
| `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD` | Akun demo administrator |

### Migrasi dan akun demo

`npm run db:migrate:deploy` menerapkan migrasi yang tersedia. Gunakan `npm run db:migrate` saat mengembangkan perubahan schema baru dan `npm run db:generate` untuk membuat ulang Prisma Client. Koneksi Prisma menggunakan zona waktu UTC. `received_on` memakai tipe PostgreSQL `DATE` untuk tanggal dokumen di WIB.

Untuk menyiapkan akun demo lokal, set `SEED_DEMO_ENABLED=true` dan isi ketiga pasangan email/password di `.env` setelah migrasi. Gunakan email berbeda untuk masing-masing role dan password 8–128 karakter. Jalankan `npm run db:seed` dari root proyek. Seed menyimpan hash Better Auth dan melewati akun dengan email yang sudah ada. Bila akun petugas demo aktif dan ber-role `WAREHOUSE`, seed menambahkan 25 RIM Kertas A4 Demo melalui service penerimaan. Pengulangan seed memakai key yang sama sehingga stok tidak bertambah lagi.

### Endpoint auth

| Method dan path | Kontrak |
| --- | --- |
| `POST /api/auth/sign-in/email` | JSON berisi `email` dan `password`. Respons sukses memuat profil pengguna dan mengirim cookie session. |
| `GET /api/auth/get-session` | Mengembalikan profil dan waktu kedaluwarsa session, atau `null` jika session sudah tidak berlaku. |
| `POST /api/auth/sign-out` | Body kosong atau `{}`. Mencabut session di database dan menghapus cookie. |

Request POST memerlukan `Origin` yang sama dengan `APP_ORIGIN`. Set `BETTER_AUTH_URL` ke origin yang sama. Gunakan `npm run dev` untuk HTTP loopback. Auth pada build produksi memerlukan origin HTTPS. Setiap session berlaku delapan jam sejak dibuat. Respons `429` menyertakan `Retry-After` dalam detik.

### Ruang kerja dan izin

Beranda publik `/` menampilkan panduan dan FAQ berbahasa Indonesia serta demo WebM dengan format cadangan MP4. Isi email atau nomor telepon di [konfigurasi kontak](src/app/landing-contact.ts) untuk menampilkan bagian Kontak. Pengguna yang berhasil masuk menuju `/ruang-kerja`.

Ruang kerja memeriksa session dan izin di server pada setiap halaman. Karyawan melihat menu Katalog dan Permintaan Saya. Petugas gudang melihat Katalog, Penerimaan, Permintaan, dan Kartu Stok. Superadmin mendapat area baca untuk operasi gudang serta menu Akun dan Audit.

`withBusinessHandler()` menggabungkan guard origin, session, izin, validasi JSON, dan kuota PostgreSQL untuk endpoint bisnis. Repository permintaan menerapkan scope pemilik pada daftar, jumlah hasil, dan detail karyawan.

### Katalog barang

Semua role bisa membuka `/katalog` untuk mencari berdasarkan kode atau nama, mengurutkan hasil, dan melihat stok. Petugas gudang dapat memakai **Tambah barang** atau **Edit** pada baris barang. Stok awal adalah nol. Setelah ada permintaan atau mutasi, petugas masih bisa mengedit nama dan lokasi rak.

| Endpoint | Kontrak |
| --- | --- |
| `GET /api/items` | Filter `q`, `page`, `limit`, `sort`, dan `direction`. Default `20` hasil per halaman, maksimum `100`. Pilihan urutan `code`, `name`, atau `stock`. |
| `POST /api/items` | Petugas Gudang membuat barang dengan `code`, `name`, `unit`, dan `location`. Sukses `201`. |
| `PATCH /api/items/:id` | Petugas Gudang mengedit minimal satu field metadata. Kode ganda atau perubahan kode/satuan setelah ada histori menghasilkan `409`. |

Kode dinormalisasi ke huruf kapital. Batas panjang untuk kode, nama, satuan, dan lokasi masing-masing 64, 160, 32, dan 120 karakter setelah dirapikan. Metadata pagination berada pada `meta` dengan field `page`, `limit`, `total`, dan `totalPages`.

### Penerimaan dan kartu stok

Petugas membuka **Penerimaan → Catat penerimaan**, memilih satu barang dari hasil pencarian, lalu mengisi jumlah, tanggal dokumen, dan asal barang. Nomor surat jalan dan catatan opsional. Petugas dan superadmin dapat membuka riwayat penerimaan atau kartu stok. Kartu stok mencatat mutasi masuk dengan nomor penerimaan dan mutasi keluar dengan nomor permintaan.

| Endpoint | Kontrak |
| --- | --- |
| `POST /api/receipts` | Petugas mengirim `itemId`, `quantity`, `receivedOn`, `sourceName`, `deliveryNoteRef` opsional dan `notes` opsional. Header `Idempotency-Key` wajib UUID. Penerimaan baru `201`, replay payload yang sama `200`, konflik key `409`. |
| `GET /api/receipts` | Riwayat untuk petugas dan superadmin. Filter `itemId`, `from`, `to`, `page`, `limit`. Rentang tanggal dokumen inklusif dan hasil diurutkan dari waktu posting terbaru. |
| `GET /api/movements` | Kartu stok untuk petugas dan superadmin. Filter `itemId`, `from`, `to`, `page`, `limit` dan `direction` (`IN` atau `OUT`). Default menampilkan kedua arah. Tanggal memakai waktu posting WIB. ID posting dikirim sebagai string dan hasil diurutkan dari ID terbaru. |

Jumlah berupa integer JSON antara 1 dan 1.000.000. Saldo maksimal 2.000.000.000. Tanggal dokumen memakai `YYYY-MM-DD` dan boleh lebih awal dari hari posting. Server merapikan teks dan memakai `null` untuk field opsional kosong sebelum menghitung hash dari enam field payload dalam urutan tetap. Form mempertahankan key saat mengulang pengiriman dengan isian yang sama. Pendataan tanggal mundur tetap mengikuti urutan posting kartu stok.

### Permintaan karyawan

Karyawan membuka **Permintaan Saya → Buat permintaan** dan memilih barang dari katalog. Jumlah yang melebihi stok terakhir tetap bisa diajukan. Pengajuan tersimpan dengan status **Menunggu**. Petugas gudang dan superadmin dapat membuka daftar dan detail seluruh permintaan.

| Endpoint | Kontrak |
| --- | --- |
| `POST /api/requests` | Khusus karyawan. Kirim `itemId`, `quantity` sebagai integer 1–1.000.000, dan `notes` opsional maksimal 500 karakter. Header `Idempotency-Key` wajib UUID. Sukses baru `201`, pengulangan payload setara `200`, konflik key `409`. |
| `GET /api/requests` | Scope sesuai role. Filter `status` dengan nilai `PENDING`, `APPROVED`, atau `REJECTED`, serta `page` dan `limit`. Default 20 dan maksimum 100 hasil per halaman. Permintaan terbaru ditampilkan lebih dahulu. |
| `GET /api/requests/:id` | Detail termasuk catatan dan informasi keputusan yang tersedia. ID yang tidak ditemukan atau berada di luar scope pemohon menghasilkan `404`. |
| `POST /api/requests/:id/approve` | Khusus petugas. Kirim objek JSON `{}`. Persetujuan menyimpan keputusan dan satu mutasi `OUT`. Stok kurang menghasilkan `409 INSUFFICIENT_STOCK`. |
| `POST /api/requests/:id/reject` | Khusus petugas. Kirim `reason` sepanjang 1–500 karakter setelah dirapikan. Penolakan menyimpan keputusan dan alasan. |

Satu key berlaku per pemohon. UUID barang, jumlah, dan catatan yang sudah dirapikan menjadi isi hash payload. Form mempertahankan key ketika pengiriman dengan isian yang sama diulang dari form tersebut. Catatan permintaan tersedia di detail.

Petugas membuka detail permintaan berstatus **Menunggu**, lalu memilih **Setujui** atau **Tolak** dan mengonfirmasi keputusan. Server mengambil pelaku dari sesi dan memeriksa stok terkini saat persetujuan. Persetujuan ulang dan penolakan ulang dengan alasan yang sama mengembalikan keputusan awal dengan `200`. Aksi berlawanan atau penggantian alasan atas keputusan terminal menghasilkan `409 ALREADY_DECIDED`.

### Administrasi akses dan audit

Superadmin membuka **Akun** untuk mengubah role atau status aktif, dan menggunakan **Cabut sesi** untuk mengakhiri seluruh sesi akun lain. Perubahan akses mencabut sesi target pada transaksi yang sama dengan audit. Pengguna yang masih aktif masuk kembali untuk memakai izin barunya. Menu **Audit** menampilkan pelaku, target, perubahan, waktu WIB, dan ID korelasi.

| Endpoint | Kontrak |
| --- | --- |
| `GET /api/admin/users` | Daftar akun khusus superadmin. Filter `page` dan `limit`, default 20 dan maksimal 100. |
| `PATCH /api/admin/users/:id/access` | Kirim `role`, `isActive`, atau keduanya. Payload yang sama dengan kondisi akun mengembalikan `200`. Aksi terhadap akun sendiri menghasilkan `403 SELF_ACCESS`. |
| `POST /api/admin/users/:id/revoke-sessions` | Kirim `{}`. Respons menyertakan akun dan jumlah sesi yang dicabut, dengan audit pencabutan tersimpan. |

Jalankan `npm run limiter:cleanup` dengan `DATABASE_URL` lingkungan yang akan dirawat. Perintah memakai waktu PostgreSQL dan melaporkan jumlah bucket kedaluwarsa yang dihapus. Pengulangan perintah aman. Operator dapat menjalankannya berkala pada lingkungan target.

## Pemeriksaan akhir

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

Jalankan `npm run build` sebelum tes integrasi. Tes auth menjalankan beberapa proses Next.js dan dapat menunggu window limiter berikutnya hingga satu menit. Tes transaksi memakai Route Handler produksi dan PostgreSQL dengan koneksi independen. Skenario meliputi pengiriman ulang, dua approval yang bersaing, approve-vs-reject, penerimaan paralel, kegagalan insert ledger, dan rekonsiliasi saldo menurut urutan posting.

`npm run test:e2e` memakai `TEST_DATABASE_URL` dan menyalakan Next.js development pada `127.0.0.1:3100`. Jalankan integrasi dan Playwright secara berurutan jika keduanya memakai database tes yang sama. Playwright memakai dua konteks browser untuk memeriksa pencabutan sesi saat role berubah, akses baru setelah login ulang, serta audit. Suite juga menjalankan regresi alur gudang.

Verifikasi 28 November 2026 meluluskan lint, typecheck, build, 103 unit test, 87 tes integrasi, serta 10 tes browser regresi dan 2 tes beranda. Smoke dari ekstraksi ZIP membuktikan migrasi terulang, seed opt-in idempoten, serta data transaksi bertahan setelah restart Next.js dan PostgreSQL 17.11. Pemeriksaan konfigurasi Compose lulus. Persistensi diuji dengan PostgreSQL portabel karena daemon Docker lokal tidak tersedia. Driver `pg` masih mengeluarkan peringatan deprecation pada beberapa operasi.

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

Simpan direktif `proxy_set_header X-Warehouse-Proxy-Token "<secret-proxy>";` di file include privat di server. Gunakan nilai yang sama dengan `TRUSTED_PROXY_SECRET` aplikasi. Mode `direct` dan request dengan bukti proxy yang tidak sah memakai kuota bersama. Verifikasi virtual host dan TLS saat memilih jalur deployment.

### CI/CD

[`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) mengikuti pola deploy Porto: lint, typecheck, unit test, dan build di GitHub Actions; push ke `main` yang hijau mengunggah artifact ke VPS lalu menjalankan migrasi dan restart. Integrasi dan e2e tetap dijalankan lokal (membutuhkan PostgreSQL/browser). Seed demo **tidak** dijalankan dari CI.

**Secrets** (Settings → Secrets and variables → Actions; environment `production` untuk job deploy). Bila VPS sama dengan Porto, salin `SSH_*` dari repo itu; hanya `DEPLOY_PATH` yang berbeda:

| Secret | Sumber |
| --- | --- |
| `SSH_HOST` | IP atau hostname VPS |
| `SSH_PORT` | Port SSH (biasanya `22`) |
| `SSH_USER` | User SSH yang public key-nya ada di `~/.ssh/authorized_keys` |
| `SSH_PRIVATE_KEY` | Private key pasangan (dari laptop / key deploy; bukan file di dalam VPS) |
| `SSH_FINGERPRINT` | Host key `SHA256:...` dari `ssh-keyscan -p PORT HOST` |
| `DEPLOY_PATH` | Root aplikasi, misalnya `/var/www/apps/warehouse` |

**Satu kali di VPS**

1. Buat database PostgreSQL kosong dan user; `migrate` tidak membuat database.
2. Buat `DEPLOY_PATH`, tulis `.env` production di situ (HTTPS `APP_ORIGIN` / `BETTER_AUTH_URL`, `TRUSTED_PROXY_MODE=nginx`, secret yang selaras dengan Nginx). Jangan commit `.env`.
3. Pasang unit systemd dari [`deploy/warehouse.service`](deploy/warehouse.service) (sesuaikan `User` dan path), lalu `systemctl enable warehouse`.
4. Izinkan user SSH menjalankan `sudo systemctl restart warehouse` tanpa password interaktif.
5. Konfigurasi Nginx + TLS sesuai blok di atas; Node hanya di `127.0.0.1:3000`.

**Alur rilis:** Actions membangun tarball (`.next`, `prisma`, `public`, lockfile, tanpa `.env`) → SCP ke `$DEPLOY_PATH/releases/<sha>` → [`deploy/activate-release.sh`](deploy/activate-release.sh) menjalankan `npm ci --omit=dev`, `db:migrate:deploy`, symlink `current`, dan `systemctl restart warehouse`. Dua release terbaru dipertahankan.

## Pengumpulan

Paket ini memakai jalur video demo dari soal. ZIP source dan video tersedia sebagai berkas terpisah di `tmp/submission/` pada workspace pengumpulan. Akun demo lokal dibuat melalui seed opt-in sesuai petunjuk setup.

| Berkas | Kegunaan |
| --- | --- |
| `papi-warehouse-source.zip` | Source aplikasi, aset demo untuk beranda, lockfile, migrasi, tes, dokumentasi, dan `.env.example` |
| `papi-warehouse-demo.mp4` | Video demo dalam MP4 untuk pengumpulan |
| `papi-warehouse-demo.webm` | Versi WebM untuk pemutaran di web |

Video berdurasi sekitar 1 menit 53 detik dan dirender dengan Remotion dari rekaman browser. Petugas membuat dan mengedit barang, mencatat penerimaan 10 unit, memproses permintaan 7 unit sampai saldo 3, dan menangani stok kurang. Karyawan melihat riwayat setelah masuk ulang. Superadmin mencabut sesi dan melihat bukti audit. Pemetaan AC01–AC22 dan hasil verifikasi tercatat di [PLAN.md](PLAN.md#pemetaan-bukti-tahap-10).

### Jika aplikasi akan dideploy

- Migrasi production dijalankan oleh langkah activate CI (`db:migrate:deploy`) atau manual dengan script yang sama; jangan `db push` atau seed demo otomatis saat startup.
- Jalankan Next.js pada interface privat/loopback di balik Nginx HTTPS. Tutup akses publik langsung ke Node dan PostgreSQL.
- Nginx menghapus/mengganti header IP yang dapat dipalsukan klien. Auth dan limiter memakai parser trusted proxy yang sama.
- Private response memakai `Cache-Control: private, no-store`; hindari shared cache data akun, session, permintaan, dan saldo.
- Verifikasi data bertahan setelah proses aplikasi restart dan setelah logout/login.
- Bagikan URL dan akun evaluator melalui saluran pengumpulan. Simpan password di luar repository.

## Referensi teknis

Diakses 26 November 2026. Cocokkan dokumentasi dengan versi package yang dipasang.

- [Next.js authentication dan authorization](https://nextjs.org/docs/app/guides/authentication)
- [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)
- [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management)
- [Better Auth rate limiting](https://www.better-auth.com/docs/concepts/rate-limit)
- [Better Auth Prisma adapter dan batas kompatibilitas](https://www.better-auth.com/docs/adapters/prisma)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html)
