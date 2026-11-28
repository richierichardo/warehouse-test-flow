import { expect, test } from "@playwright/test";

test("beranda publik memuat panduan, demo, FAQ, dan tautan masuk", async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page).toHaveTitle("Warehouse Testing");
  await expect(page.getByRole("heading", { level: 1, name: "Warehouse Testing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cara pakai" })).toBeVisible();
  await expect(page.locator('video source[type="video/webm"]')).toHaveAttribute("src", "/demo/papi-warehouse-demo.webm");
  const video = await request.get("/demo/papi-warehouse-demo.webm", { headers: { Range: "bytes=0-63" } });
  expect(video.status()).toBe(206);
  expect(video.headers()["content-type"]).toContain("video/webm");
  expect((await video.body()).subarray(0, 4).toString("hex")).toBe("1a45dfa3");

  const question = page.locator("summary").filter({ hasText: "Kapan stok berkurang?" });
  await question.focus();
  await question.press("Enter");
  await expect(page.getByText("Stok berkurang ketika petugas", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole("link", { name: "Masuk ke aplikasi" }).click();
  await expect(page).toHaveURL("/login");
  await page.getByRole("link", { name: "Kembali ke beranda" }).click();
  await expect(page).toHaveURL("/");
});

test("form masuk menunggu JavaScript siap sebelum menerima pengiriman", async ({ page }) => {
  await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, (route) => route.abort());
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Masuk", exact: true })).toBeDisabled();
});
