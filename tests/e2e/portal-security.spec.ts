import { expect, test } from "@playwright/test";

test("shopkeeper sign-in explains that access is server checked", async ({ page }) => {
  await page.goto("/shopkeeper/login");
  await expect(page.getByRole("heading", { name: "Shopkeeper sign in" })).toBeVisible();
  await expect(page.getByText("Access is checked again on the server.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute("href", "/auth/login?next=%2Fshopkeeper");
});

test("anonymous requests cannot create products through the Owner API", async ({ request }) => {
  const response = await request.post("/api/owner/products", { data: {} });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: "Owner access is required." });
});

test("shopkeeper sign-in remains within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shopkeeper/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
