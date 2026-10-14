import { expect, test } from "@playwright/test";

const majorRoutes = [
  "/", "/about", "/shop", "/search", "/collections/wedding", "/category/men-s-wear-shirts", "/product/demo-mens-formal-shirt", "/contact", "/faq", "/store-visit",
  "/account", "/account/addresses", "/account/orders", "/account/profile", "/account/preferences", "/account/security", "/account/sessions", "/account/store-visits", "/account/wishlist",
  "/privacy-policy", "/terms", "/shipping-policy", "/return-refund-policy", "/auth/login", "/auth/signup", "/auth/forgot-password", "/auth/reset-password", "/cart", "/checkout", "/track-order",
  "/shopkeeper/login", "/shopkeeper/owner", "/shopkeeper/owner/products", "/shopkeeper/owner/orders", "/shopkeeper/owner/refunds", "/shopkeeper/owner/settings", "/shopkeeper/owner/staff", "/shopkeeper/owner/store-visits", "/shopkeeper/owner/store-visits/calendar", "/shopkeeper/owner/store-pickups", "/shopkeeper/staff/dashboard", "/shopkeeper/staff/orders", "/shopkeeper/staff/store-visits", "/shopkeeper/staff/store-pickups",
];

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

  const staffAction = await request.patch("/api/shopkeeper/orders/not-a-real-order", { data: {} });
  expect(staffAction.status()).toBe(403);
});

test("store visit and pickup APIs reject anonymous direct requests", async ({ request }) => {
  const denied = [
    ["GET", "/api/owner/store-visits", 403],
    ["GET", "/api/owner/store-pickups", 403],
    ["GET", "/api/owner/store-slots?date=2026-10-20", 403],
    ["GET", "/api/staff/store-visits", 403],
    ["GET", "/api/staff/store-pickups", 403],
    ["GET", "/api/store-visits", 401],
    ["POST", "/api/cron/reminders", 401],
    ["PATCH", "/api/owner/store-visits/no-such-visit", 403],
    ["PATCH", "/api/owner/store-pickups/no-such-order", 403],
    ["PATCH", "/api/staff/store-visits/no-such-visit", 403],
    ["PATCH", "/api/staff/store-pickups/no-such-order", 403],
    ["PATCH", "/api/account/store-visits/no-such-visit", 401],
    ["POST", "/api/account/orders/no-such-order/pickup-code", 401],
  ] as const;
  for (const [method, path, status] of denied) {
    const response = method === "GET" ? await request.get(path) : method === "POST" ? await request.post(path, { data: {} }) : await request.patch(path, { data: {} });
    expect(response.status(), `${method} ${path}`).toBe(status);
  }
});

test("malformed JSON requests return validation errors instead of server errors", async ({ request }) => {
  for (const path of ["/api/newsletter", "/api/auth/signup", "/api/auth/otp/request"]) {
    const response = await request.post(path, {
      data: "{",
      headers: { "content-type": "application/json" },
    });
    expect(response.status(), path).toBe(400);
  }
});

test("local sample catalogue images load from replaceable public asset paths", async ({ request }) => {
  for (const image of ["mens-formal.svg", "silk-saree.svg", "bridal-saree.svg", "banner-wedding.svg", "banner-sidhee.svg", "fallback.svg"]) {
    const response = await request.get(`/images/demo/${image}`);
    expect(response.status(), image).toBe(200);
    expect(response.headers()["content-type"], image).toContain("image/svg+xml");
    expect(await response.text(), image).toContain("SAMPLE ARTWORK");
  }
});

test("shopkeeper sign-in remains within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shopkeeper/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("storefront routes keep the selected light or dark theme after navigation", async ({ page }) => {
  test.setTimeout(120_000);
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/auth/login");
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    await page.reload();

    for (const route of majorRoutes) {
      const response = await page.goto(route);
      expect(response?.status() ?? 500, `${route} (${theme})`).toBeLessThan(500);
      await expect(page.locator("html"), `${route} should remain in English`).toHaveAttribute("lang", "en-IN");
      if (theme === "dark") await expect(page.locator("html"), `${route} should be dark`).toHaveClass(/dark/);
      else await expect(page.locator("html"), `${route} should be light`).not.toHaveClass(/dark/);
    }
  }
});

test("Hindi selection translates key screens and persists across navigation", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "हि" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi-IN");
  await expect(page.getByText("दुकान पर आने की योजना बनाएँ").first()).toBeVisible();
  await expect(page.getByText("गांधी चौक, सीधी").first()).toBeVisible();

  await page.goto("/auth/login");
  await expect(page.getByText(/बहु-कारक प्रमाणीकरण/)).toBeVisible();

  await page.goto("/store-visit");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi-IN");
  await expect(page.getByText("आपकी संपर्क जानकारी")).toBeVisible();
  await expect(page.getByRole("button", { name: "दुकान आने का अनुरोध भेजें" })).toBeVisible();

  await page.goto("/shop");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi-IN");
  await expect(page.getByText("दुकान पर आने की योजना बनाएँ").first()).toBeVisible();
  await expect(page.getByText("पृष्ठ 1 में से 1")).toBeVisible();

  for (const route of majorRoutes) {
    const response = await page.goto(route);
    expect(response?.status() ?? 500, `${route} (Hindi)`).toBeLessThan(500);
    await expect(page.locator("html"), `${route} should remain in Hindi`).toHaveAttribute("lang", "hi-IN");
  }

  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-IN");
  await expect(page.getByText("Plan Your Store Visit").first()).toBeVisible();
});
