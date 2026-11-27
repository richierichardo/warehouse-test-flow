import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { testDatabaseUrl } from "../integration/database";

const users = (["EMPLOYEE", "WAREHOUSE", "SUPERADMIN"] as const).map((role) => ({
  id: randomUUID(), email: `${randomUUID()}@example.test`, name: `Fixture ${role}`, role,
}));
const password = randomBytes(24).toString("hex");
let db: PrismaClient;

test.beforeAll(async () => {
  const adapter = new PrismaPg({ connectionString: testDatabaseUrl(), options: "-c timezone=UTC" });
  db = new PrismaClient({ adapter });
  const hash = await hashPassword(password);
  await db.$transaction(users.map((user) => db.user.create({ data: { ...user, accounts: { create: {
    id: randomUUID(), accountId: user.id, providerId: "credential", password: hash,
  } } } })));
});

test.afterAll(async () => {
  if (!db) return;
  try {
    await db.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
    const secret = process.env.WAREHOUSE_E2E_RATE_SECRET;
    if (secret) {
      const keys = ["login", "auth"].map((bucket) => createHmac("sha256", secret).update(`${bucket}\0shared`).digest("hex"));
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

for (const user of users) {
  test(`${user.role} masuk dan melihat navigasi sesuai izin`, async ({ page }) => {
    await login(page, user.email);
    const nav = page.getByRole("navigation", { name: "Navigasi ruang kerja" });
    await expect(nav.getByRole("link")).toHaveText(expectedMenus[user.role]);
    await nav.getByRole("link", { name: "Katalog" }).click();
    await expect(page).toHaveURL("/katalog");
    await expect(page.getByRole("heading", { name: "Katalog" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Katalog" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Fitur ini belum tersedia.")).toBeVisible();

    await page.goto("/admin/akun");
    if (user.role === "SUPERADMIN") {
      await expect(page.getByRole("heading", { name: "Akun" })).toBeVisible();
    } else {
      await expect(page).toHaveURL("/akses-ditolak");
      await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Akun" })).toHaveCount(0);
      await page.goto("/");
    }
    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/katalog");
    await expect(page).toHaveURL("/login");
  });
}

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
