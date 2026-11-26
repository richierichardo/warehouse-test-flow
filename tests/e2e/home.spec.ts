import { expect, test } from "@playwright/test";

test("menampilkan halaman awal dalam bahasa Indonesia", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { level: 1, name: "Gudang Perlengkapan Kantor" })).toBeVisible();
});
