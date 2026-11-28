import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { testDatabaseUrl } from "../integration/database";

const password = randomBytes(24).toString("hex");
const [admin, target] = (["SUPERADMIN", "EMPLOYEE"] as const).map((role) => ({
  id: randomUUID(), name: `Akun tes ${role}`, email: `${randomUUID()}@example.test`, role,
}));
let db: PrismaClient;

test.beforeAll(async ({ request }, testInfo) => {
  testInfo.setTimeout(105_000);
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl(), options: "-c timezone=UTC" }) });
  const hash = await hashPassword(password);
  await db.$transaction([admin, target].map((user) => db.user.create({ data: { ...user, accounts: { create: {
    id: randomUUID(), accountId: user.id, providerId: "credential", password: hash,
  } } } })));
  // Compile both Route Handlers before a development reload can interrupt a mutation.
  for (const action of ["access", "revoke-sessions"]) {
    const response = await request.get(`/api/admin/users/${target.id}/${action}`, { timeout: 45_000 });
    expect(response.status()).toBe(405);
  }
});

test.afterAll(async () => {
  if (!db) return;
  try {
    await db.accessAudit.deleteMany({ where: { actorId: admin.id } });
    await db.user.deleteMany({ where: { id: { in: [admin.id, target.id] } } });
    const secret = process.env.WAREHOUSE_E2E_RATE_SECRET;
    if (secret) {
      const keys = ["login\0shared", "auth\0shared", ...[admin.id, target.id].flatMap((id) => ["read", "write", "admin"].map((bucket) => `${bucket}\0${id}`))];
      await db.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys.map((key) => createHmac("sha256", secret).update(key).digest("hex")) } } });
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
    page.waitForResponse((res) => new URL(res.url()).pathname === "/api/auth/sign-in/email", { timeout: 25_000 }),
    page.getByRole("button", { name: "Masuk" }).click(),
  ]);
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL("/ruang-kerja");
}

test("perubahan akses dan pencabutan sesi berlaku pada konteks browser pengguna lain", async ({ page, browser, baseURL }) => {
  test.setTimeout(155_000);
  const targetContext = await browser.newContext({ baseURL });
  try {
    const targetPage = await targetContext.newPage();
    await login(page, admin.email);
    await login(targetPage, target.email);
    await expect(targetPage.getByRole("link", { name: "Permintaan Saya" })).toBeVisible();
    await targetPage.goto("/katalog");
    await page.goto("/admin/akun");
    const own = page.getByRole("listitem").filter({ hasText: admin.email });
    await expect(own.getByRole("button", { name: "Ubah akses" })).toHaveCount(0);
    const row = page.getByRole("listitem").filter({ hasText: target.email });
    await row.getByRole("button", { name: "Ubah akses" }).click();
    const edit = page.getByRole("dialog", { name: "Ubah akses akun" });
    await edit.getByRole("combobox", { name: "Role" }).selectOption("WAREHOUSE");
    const accessRequest = "**/api/admin/users/*/access";
    await page.route(accessRequest, (route) => route.fulfill({ status: 429, headers: { "Retry-After": "1" }, json: {} }));
    await edit.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(edit.getByRole("alert")).toHaveText("Coba lagi setelah 1 detik.");
    await page.unroute(accessRequest);
    const [saved] = await Promise.all([
      page.waitForResponse((res) => new URL(res.url()).pathname.endsWith("/access") && res.request().method() === "PATCH", { timeout: 35_000 }),
      edit.getByRole("button", { name: "Simpan perubahan" }).click(),
    ]);
    expect(saved.status()).toBe(200);
    await expect(row.getByText("Petugas Gudang · Aktif", { exact: true })).toBeVisible();
    await targetPage.reload();
    await expect(targetPage).toHaveURL("/login?reason=session-expired");
    await login(targetPage, target.email);
    await expect(targetPage.getByRole("link", { name: "Penerimaan", exact: true })).toBeVisible();
    await expect(targetPage.getByRole("link", { name: "Akun", exact: true })).toHaveCount(0);

    await row.getByRole("button", { name: "Cabut sesi" }).click();
    const revoke = page.getByRole("dialog", { name: "Cabut sesi akun" });
    const [revoked] = await Promise.all([
      page.waitForResponse((res) => new URL(res.url()).pathname.endsWith("/revoke-sessions") && res.request().method() === "POST", { timeout: 35_000 }),
      revoke.getByRole("button", { name: "Konfirmasi pencabutan" }).click(),
    ]);
    expect(revoked.status()).toBe(200);
    await expect(row.getByText("Pencabutan sesi selesai. 1 sesi dicabut.")).toBeVisible();
    await targetPage.goto("/penerimaan");
    await expect(targetPage).toHaveURL("/login?reason=session-expired");
    await page.getByRole("link", { name: "Audit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Audit akses" })).toBeVisible();
    const audit = page.getByRole("listitem").filter({ hasText: target.name });
    await expect(audit.getByRole("heading", { name: "Perubahan akses" })).toBeVisible();
    await expect(audit.getByRole("heading", { name: "Pencabutan sesi" })).toBeVisible();
  } finally {
    await targetContext.close();
  }
});
