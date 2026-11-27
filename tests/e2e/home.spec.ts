import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { deleteCatalogFixtures, receiveFixtureStock } from "../catalog-fixture";
import { testDatabaseUrl } from "../integration/database";

const users = (["EMPLOYEE", "WAREHOUSE", "SUPERADMIN"] as const).map((role) => ({
  id: randomUUID(), email: `${randomUUID()}@example.test`, name: `Fixture ${role}`, role,
}));
const password = randomBytes(24).toString("hex");
const catalogCode = `BROWSER-A4-${randomBytes(4).toString("hex").toUpperCase()}`;
const catalogName = `Kertas A4 ${catalogCode}`;
let db: PrismaClient;

test.beforeAll(async () => {
  const adapter = new PrismaPg({ connectionString: testDatabaseUrl(), options: "-c timezone=UTC" });
  db = new PrismaClient({ adapter });
  const hash = await hashPassword(password);
  await db.$transaction(users.map((user) => db.user.create({ data: { ...user, accounts: { create: {
    id: randomUUID(), accountId: user.id, providerId: "credential", password: hash,
  } } } })));
  const item = await db.item.create({ data: { code: catalogCode, name: catalogName, unit: "RIM", location: "Rak 1", createdById: users[1].id } });
  await receiveFixtureStock(db, item.id, users[1].id, 1_250);
});

test.afterAll(async () => {
  if (!db) return;
  try {
    await deleteCatalogFixtures(db, users[1].id);
    await db.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
    const secret = process.env.WAREHOUSE_E2E_RATE_SECRET;
    if (secret) {
      const identities = ["login\0shared", "auth\0shared", ...users.flatMap(({ id }) => [`read\0${id}`, `write\0${id}`])];
      const keys = identities.map((identity) => createHmac("sha256", secret).update(identity).digest("hex"));
      await db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } });
    }
  } finally {
    await db.$disconnect();
  }
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === "/api/auth/sign-in/email", { timeout: 25_000 }),
    page.getByRole("button", { name: "Masuk" }).click(),
  ]);
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL("/");
}

const expectedMenus = {
  EMPLOYEE: ["Katalog", "Permintaan Saya"],
  WAREHOUSE: ["Katalog", "Penerimaan", "Permintaan", "Kartu Stok"],
  SUPERADMIN: ["Katalog", "Penerimaan", "Permintaan", "Kartu Stok", "Akun", "Audit"],
};

async function searchCatalog(page: Page, query: string) {
  await page.getByLabel("Cari kode atau nama").fill(query);
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page).toHaveURL(/\/katalog\?q=/);
}

for (const user of users) {
  test(`${user.role} masuk dan melihat navigasi sesuai izin`, async ({ page }) => {
    test.setTimeout(105_000);
    if (user.role === "EMPLOYEE") await page.setViewportSize({ width: 390, height: 844 });
    await login(page, user.email);
    const nav = page.getByRole("navigation", { name: "Navigasi ruang kerja" });
    await expect(nav.getByRole("link")).toHaveText(expectedMenus[user.role]);
    await nav.getByRole("link", { name: "Katalog" }).click();
    await expect(page).toHaveURL("/katalog");
    await expect(page.getByRole("heading", { name: "Katalog" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Katalog" })).toHaveAttribute("aria-current", "page");
    await searchCatalog(page, catalogCode.toLowerCase());
    await expect(page.getByText(catalogName, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("1.250", { exact: true }).filter({ visible: true })).toBeVisible();
    if (user.role === "EMPLOYEE") {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
    const addButton = page.getByRole("link", { name: "Tambah barang" });
    if (user.role === "WAREHOUSE") {
      await expect(addButton).toBeVisible();
      await page.getByRole("link", { name: `Edit ${catalogName}` }).filter({ visible: true }).click();
      await expect(page.getByLabel("Kode barang")).toHaveAttribute("readonly", "");
      await expect(page.getByLabel("Satuan")).toHaveAttribute("readonly", "");
      await expect(page.getByLabel("Nama barang")).toBeEditable();
    } else {
      await expect(addButton).toHaveCount(0);
      await page.goto("/katalog/baru");
      await expect(page).toHaveURL("/akses-ditolak");
    }

    await page.goto("/admin/akun");
    if (user.role === "SUPERADMIN") {
      await expect(page.getByRole("heading", { name: "Akun" })).toBeVisible();
    } else {
      await expect(page).toHaveURL("/akses-ditolak");
      await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Akun" })).toHaveCount(0);
      await page.goto("/katalog");
    }
    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/katalog");
    await expect(page).toHaveURL("/login");
  });
}

test("petugas membuat barang dengan stok nol dan mengedit metadata dari katalog", async ({ page }) => {
  test.setTimeout(105_000);
  const code = `BROWSER-NEW-${randomBytes(4).toString("hex").toUpperCase()}`;
  const name = `Buku tulis ${code}`;
  await login(page, users[1].email);
  await page.getByRole("link", { name: "Katalog" }).click();
  await page.getByRole("link", { name: "Tambah barang" }).click();
  await page.getByLabel("Kode barang").fill(code.toLowerCase());
  await page.getByLabel("Nama barang").fill(name);
  await page.getByLabel("Satuan").fill("PCS");
  await page.getByLabel("Lokasi rak").fill("Rak baru");
  const [created] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === "/api/items" && result.request().method() === "POST", { timeout: 40_000 }),
    page.getByRole("button", { name: "Simpan barang" }).click(),
  ]);
  expect(created.status()).toBe(201);
  await expect(page).toHaveURL("/katalog");
  await searchCatalog(page, code);
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row.getByRole("cell", { name: "0", exact: true })).toBeVisible();
  await row.getByRole("link", { name: `Edit ${name}` }).click();
  await expect(page.getByLabel("Kode barang")).toHaveValue(code);
  await page.getByLabel("Satuan").fill("BOX");
  await page.getByLabel("Lokasi rak").fill("Rak B");
  const [updated] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname.startsWith("/api/items/") && result.request().method() === "PATCH", { timeout: 40_000 }),
    page.getByRole("button", { name: "Simpan barang" }).click(),
  ]);
  expect(updated.status()).toBe(200);
  await expect(page).toHaveURL("/katalog");
  await searchCatalog(page, code);
  await expect(row.getByRole("cell", { name: "BOX", exact: true })).toBeVisible();
  await expect(row.getByRole("cell", { name: "Rak B", exact: true })).toBeVisible();
  await expect(row.getByRole("cell", { name: "0", exact: true })).toBeVisible();
});

test("menampilkan login dan sesi kedaluwarsa dengan ruang kerja yang pas di ponsel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
  await login(page, users[0].email);
  await expect(page.getByRole("heading", { level: 1, name: "Gudang Perlengkapan Kantor" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Permintaan Saya" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await db.session.updateMany({ where: { userId: users[0].id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await page.goto("/permintaan");
  await expect(page).toHaveURL("/login?reason=session-expired");
  await expect(page.getByText("Sesi Anda telah berakhir. Silakan masuk lagi.")).toBeVisible();
});

test("menampilkan pesan login generik dan waktu tunggu 429", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(users[0].email);
  await page.getByLabel("Password").fill(randomBytes(20).toString("hex"));
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Email atau password salah.");

  await page.route("**/api/auth/sign-in/email", (route) => route.fulfill({ status: 429, headers: { "Retry-After": "20" } }));
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(/Coba lagi dalam \d+ detik/);
  await expect(page.getByRole("button", { name: "Masuk" })).toBeDisabled();
});

test("petugas mencatat penerimaan dan melihat saldo di kartu stok pada ponsel", async ({ page }) => {
  test.setTimeout(140_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, users[1].email);
  await page.getByRole("link", { name: "Penerimaan", exact: true }).click();
  await page.getByRole("link", { name: "Catat penerimaan" }).click();
  await expect(page.getByLabel("Tanggal penerimaan (WIB)")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByLabel("Cari barang berdasarkan kode atau nama").fill(catalogCode);
  await page.getByRole("button", { name: "Cari barang", exact: true }).click();
  await page.getByRole("button", { name: `${catalogCode} · ${catalogName} · RIM` }).click();
  await page.getByLabel("Jumlah", { exact: true }).fill("12");
  await page.getByLabel("Tanggal penerimaan (WIB)").fill("2024-02-29");
  await page.getByLabel("Asal barang").fill("Toko ATK browser");
  await page.getByLabel("Nomor surat jalan (opsional)").fill("SJ-BROWSER");
  await page.getByLabel("Catatan (opsional)").fill("Diuji melalui form");

  let firstKey: string | undefined;
  await page.route("**/api/receipts", async (route) => {
    firstKey = route.request().headers()["idempotency-key"];
    await route.fulfill({ status: 503, json: { error: { message: "Layanan sementara tidak tersedia." } } });
  });
  await page.getByRole("button", { name: "Simpan penerimaan" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Layanan sementara tidak tersedia." })).toBeVisible();
  expect(firstKey).toMatch(/^[a-f\d-]{36}$/i);
  await page.unroute("**/api/receipts");

  const [response] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === "/api/receipts" && result.request().method() === "POST", { timeout: 35_000 }),
    page.getByRole("button", { name: "Simpan penerimaan" }).click(),
  ]);
  expect(response.status()).toBe(201);
  expect(response.request().headers()["idempotency-key"]).toBe(firstKey);
  const { data: { receiptNo } } = await response.json();
  await expect(page.getByRole("heading", { name: "Penerimaan tersimpan" })).toBeVisible();
  await expect(page.getByText("Saldo setelah penerimaan 1.262")).toBeVisible();

  await page.getByRole("link", { name: "Lihat riwayat penerimaan" }).click();
  const entry = page.getByRole("listitem").filter({ hasText: receiptNo });
  await expect(entry.getByText("SJ-BROWSER")).toBeVisible();
  await expect(entry.getByText("Diuji melalui form")).toBeVisible();
  await page.getByRole("link", { name: "Kartu Stok", exact: true }).click();
  await expect(entry.getByText("+12 RIM", { exact: true })).toBeVisible();
  await expect(entry.getByText("1.262 RIM", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("superadmin membaca penerimaan dan kartu stok dengan akses baca", async ({ page }) => {
  test.setTimeout(105_000);
  await login(page, users[2].email);
  await page.getByRole("link", { name: "Penerimaan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Penerimaan", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${catalogCode} · ${catalogName}` }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Catat penerimaan" })).toHaveCount(0);
  await page.getByRole("link", { name: "Kartu Stok", exact: true }).click();
  await expect(page.getByText("+1.250 RIM", { exact: true })).toBeVisible();
  await page.goto("/penerimaan/baru");
  await expect(page).toHaveURL("/akses-ditolak");
});
