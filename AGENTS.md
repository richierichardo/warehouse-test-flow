# AGENTS.md — Warehouse Office Supplies

## Tujuan dan scope

Implementasikan aplikasi satu gudang sesuai [PRD.md](PRD.md), berurutan melalui [PLAN.md](PLAN.md). [README.md](README.md) adalah panduan operator/reviewer dan harus mencerminkan implementasi aktual.

Stack yang dipilih user: Next.js + React + TypeScript. Arsitektur: modular monolith, satu PostgreSQL. Jangan mengganti ke Laravel, memecah service berdasarkan role, atau menambah framework backend lain tanpa kebutuhan baru yang jelas dari user.

Dokumen ini ditujukan untuk agent implementasi repository. Paket awal hanya berisi dokumen; jangan melaporkan fitur, test, akun atau deployment seolah sudah dibuat.

## Cara bekerja

1. Baca PRD dan PLAN sebelum perubahan; inspect repository/lockfile sebelum menentukan package/API.
2. Kerjakan satu tahap PLAN sampai gate terbukti, baru lanjut. Satu tahap satu commit utama bila repository/git tersedia; jangan mengarang SHA atau membuat commit berisi perubahan user yang tidak terkait.
3. Jangan overwrite pekerjaan user atau mengubah history untuk menyesuaikan rencana. Selesaikan pekerjaan rutin yang sudah berada dalam scope tanpa meminta izin ulang.
4. Seluruh keputusan teknis harus dapat dipertanggungjawabkan. Jika ada pendekatan user yang mengganggu kebutuhan wajib, jelaskan konsekuensinya dan pilih perbaikan terkecil yang menjaga tujuan.
5. Jika ambiguity kecil, tetapkan asumsi konservatif dan catat. Jika mengubah role operasional, kapan stok berkurang, public signup, sumber data, atau scope utama, minta keputusan yang diperlukan sebelum pekerjaan dependen.
6. Jangan menambah AI, microservices, message broker, Redis, websocket, upload, supplier master, PO atau adjustment untuk mempercantik arsitektur.
7. Cari kode memakai `rg`; baca hasil sebelum edit. Gunakan patch kecil dan review diff. Jangan menambahkan lapisan abstraksi tanpa manfaat nyata.

## Package dan runtime

- Gunakan npm + package-lock.json; jangan mencampur pnpm/yarn lockfile.
- TypeScript strict. Jangan memakai `any`, `@ts-ignore`, atau mematikan lint agar build terlihat lolos tanpa alasan spesifik yang didokumentasikan.
- Gunakan release stabil kompatibel. Pin Prisma 7 sampai adapter Better Auth mendukung major berikutnya dan user memang membutuhkan upgrade.
- Next.js, React, Better Auth, adapter dan Node harus lolos compatibility smoke test; rekam versi exact. Jangan berasumsi tutorial major lain masih benar.
- PostgreSQL 17 baseline. Tidak mengganti test database menjadi SQLite bila tujuannya menguji row lock, FK, custom SQL atau konkurensi.
- Database/auth berjalan di Node runtime. Database URL dan secret tidak memakai `NEXT_PUBLIC_`.

## Boundary kode

- App Router entry points tipis. Pisahkan Catalog, Receiving, Requisitions, Inventory, Identity/Access dan Audit di `src/modules/`.
- Semua DB access berada di server-only repository/infrastruktur. Client Component tidak mengimpor Prisma, secret atau auth server.
- Server Components memakai read service/DAL secara langsung setelah principal guard; jangan self-fetch internal API.
- Browser mutation memakai Route Handlers sebagai satu jalur MVP. Jangan membuat duplikat Server Action atau endpoint alternatif yang melewati guard.
- Service bisnis menerima actor/principal tepercaya; jangan membangun actor dari payload client.
- Gunakan DTO allowlist untuk menghindari kebocoran field auth/internal; jangan return record Prisma lengkap secara sembarangan.
- SQL mentah hanya terparameterisasi, misalnya tagged template Prisma. Jangan interpolasi identifier/filter dari input user ke SQL string.

## Authentication dan session — wajib

- Gunakan Better Auth + adapter Prisma dan schema hasil generator konfigurasi actual. Jangan membuat password hashing, cookie signing, token generator atau session framework sendiri.
- Email/password, public signup disabled termasuk akses endpoint langsung; akun disiapkan seed/CLI operator.
- Auth HTTP memakai path/method allowlist PRD §5. Jangan membiarkan mutation profil/password/plugin yang tidak digunakan terbuka hanya karena tersedia secara default di library.
- Session tersimpan di DB, expires 8 jam fixed, refresh disabled, cookie cache disabled. Jangan menyimpan JWT/session token di localStorage.
- Cookie HttpOnly, SameSite=Lax, Secure di production HTTPS, host-only. Dev HTTP exception harus terbatas lokal.
- Logout mencabut session DB dan expire cookie lewat POST. Role/status change mencabut seluruh session target.
- `requirePrincipal()` memeriksa session dan role/status terkini dari DB pada protected page dan setiap protected handler. Middleware/layout/client UI bukan security boundary tunggal.
- Akun nonaktif tidak boleh memakai session lama atau memperoleh session usable baru. Uji hook auth dan guard aplikasi.
- Jangan membuka public signup sementara untuk mempermudah seed. Seed/CLI memakai primitive hashing/provisioning library yang sesuai versi dan schema resmi, bukan password mentah.
- Tidak ada default deployed password di source. Seed opt-in, idempotent, tidak mereset akun existing diam-diam.

## RBAC — wajib

- Satu role per akun: EMPLOYEE, WAREHOUSE, SUPERADMIN. Gunakan permission map PRD §4, deny-by-default.
- Employee hanya melihat request sendiri; ownership diterapkan di query/detail backend, bukan filter browser.
- Warehouse mengelola katalog/penerimaan/keputusan. Superadmin mengelola akses dan audit read-only; tidak otomatis mendapat izin gudang.
- Role/is_active adalah server-owned additional fields dengan input disabled. Tolak payload tak dikenal pada endpoint aplikasi; jangan mass-assign body ke Prisma.
- Actor ID, saldo, status keputusan, waktu dan nomor transaksi ditentukan server.
- Admin access changes memakai shared advisory lock di DB; recheck actor/target, blok self edit, pertahankan last active superadmin.
- Role/status update, revoke session dan audit harus atomik. Tidak ada account hard-delete/cascade hilangnya histori.

## Boundary HTTP dan rate limit — wajib

- Implementasikan PRD §6–7. Origin mutation harus match origin konfigurasi; reject missing/null/cross-origin. Jangan disable origin/CSRF library.
- Body aplikasi maksimum 32 KiB, content type sesuai, Zod strict. GET tidak mengubah state bisnis.
- Rate limit PostgreSQL atomik dan persistent. Jangan memakai Map/module global, localStorage, tombol disabled atau Nginx saja sebagai limiter aplikasi.
- Auth HTTP catch-all dibungkus guard sebelum Better Auth; login 10/menit/IP, auth lain 120/menit/IP. Terapkan shared authenticated buckets PRD, termasuk decision dan admin.
- Pemanggilan `auth.api` server-side tidak tercakup limiter bawaan; tidak boleh membuat jalur login alternatif tanpa consume shared bucket.
- Gunakan DB clock, composite unique window counter, HMAC key untuk IP, dan `Retry-After` pada 429. Limit aktif dalam test dan production.
- Counter dikonsumsi dalam operasi singkat sebelum transaksi bisnis. Jangan menahan lock limiter sambil menunggu stok.
- Percaya header IP hanya dari topology proxy yang terbukti; Node harus privat di belakang Nginx yang menimpa header. Header X-Forwarded-For buatan klien tidak boleh mereset limit.
- Storage limiter failure: 503 untuk auth/mutation; tidak fail-open. Jangan membuat retry loop otomatis pada 429.
- Auth/session/private data tidak masuk public/shared cache. Gunakan private no-store untuk protected HTTP responses.
- Jangan log password, token/cookie, secret, URL database atau seluruh request headers. Error public tidak menampilkan SQL atau stack trace.

## Invariant stok — tidak dapat ditawar

1. Barang baru stock = 0; tidak ada opening stock dari form.
2. Qty adalah integer positif dalam batas PRD; database menolak saldo negatif/overflow.
3. Permintaan PENDING tidak mengurangi/mereservasi stok.
4. Penerimaan, saldo dan IN ledger berada dalam satu transaksi.
5. Approval, saldo, OUT ledger dan state request berada dalam satu transaksi.
6. Approval mengunci request lalu item dengan `FOR UPDATE`, memakai DB transaction client yang sama; receiving mengunci item yang sama.
7. Baca status dan stok terbaru setelah lock; jangan menggunakan saldo dari UI atau read sebelum transaksi.
8. Stok tidak cukup menyebabkan rollback seluruh approval dan status tetap PENDING.
9. Unique source request pada movement memastikan satu OUT maksimum per request. Guard status + lock tetap wajib.
10. Replay approve/reject mengikuti PRD; metadata keputusan pertama tidak ditimpa retry.
11. Receipt/request creation mendukung Idempotency-Key + payload hash. Pada unique race rollback lalu baca committed result di luar aborted transaction.
12. Tidak ada edit/delete ledger, receipt atau request terminal; tidak ada direct stock setter. Adjustment adalah fitur masa depan yang membutuhkan desain baru.
13. Setiap penulis stok mengikuti item lock yang sama. Movement balance_after mengikuti posting order, bukan tanggal dokumen backdate.
14. Semua operasi transaksi pendek, tanpa HTTP/email/external side effect di dalam lock. Bila menambah retry deadlock/serialization, batasi retry dan pastikan idempotency.

## UI dan scope produk

- Bahasa Indonesia, tanggal Asia/Jakarta, label status teks, akses keyboard dan form label/error yang jelas.
- Role-aware navigation untuk UX, tetap dukung 401/403/404 dari server dengan benar.
- Loading/empty/error/session expiry/429 harus terlihat. Jangan expose stack atau detail implementasi ke pengguna operasional.
- Jangan menambah dashboard/chart dekoratif sebelum katalog, penerimaan, permintaan, keputusan dan kartu stok berfungsi.
- Asal barang dan referensi surat jalan cukup field penerimaan; bukan modul PO/supplier/upload. Satu receipt satu item pada MVP.
- Tidak ada palet brand yang diberikan untuk proyek ini; jangan memaksakan palet dari proyek user lain.

## Verifikasi dan pelaporan

- Gunakan acceptance criteria AC01–AC22. Test utama mencakup real HTTP access, session revoke, CSRF/origin, direct auth endpoint, limiter dan PostgreSQL concurrency.
- Concurrency test memakai koneksi/transaksi independen dengan barrier/sinkronisasi. Mock atau satu koneksi terserial tidak membuktikan correctness.
- Wajib buktikan: stok 10 dua request 7; duplicate approve; approve-vs-reject; duplicate receipt; receiving bersamaan approval; rollback fault injection; IDOR; revoked session; rate lintas proses dan spoofed IP.
- Pakai database test tersendiri. Jangan reset/truncate production atau DB user untuk menjalankan test.
- Jalankan lint, typecheck, unit, integration, e2e dan build sesuai perubahan. Jangan menambah test yang sekadar mengulang teks dokumen atau snapshot implementasi tanpa menguji perilaku.
- Catat command dan hasil aktual di log PLAN, update README setelah fakta berubah. Jika lingkungan menghalangi suatu check, tulis check yang belum dilakukan dan batas keyakinannya.
- Jangan mengklaim aplikasi aman sepenuhnya, exactly-once jaringan, deployed, test lulus atau source ZIP siap bila belum terbukti.

## Delivery

Update README dengan setup reproducible, versi, env example, schema migration, seed opt-in, hasil check, URL/video aktual dan known limitations. Akun evaluator dibagikan melalui saluran pengumpulan, tidak hardcoded di source publik.

ZIP source aplikasi harus dapat diekstrak dan dijalankan dari clean setup. Sertakan lockfile/migrasi/dokumen; kecualikan `.env`, secret, DB dump, log, `.next` dan `node_modules`. ZIP paket spesifikasi awal tidak sama dengan source ZIP aplikasi selesai.

Referensi implementasi ada di README dan PRD. Periksa dokumentasi resmi sesuai major yang terkunci sebelum memakai API baru.
