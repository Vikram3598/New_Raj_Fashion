import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3015";
const e2eCronSecret = process.env.E2E_CRON_SECRET ?? "nrf-e2e-only-cron-secret";
const e2eRazorpayWebhookSecret = process.env.E2E_RAZORPAY_WEBHOOK_SECRET ?? "nrf-e2e-only-webhook-secret";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --port 3015",
    url: baseURL,
    env: { ...process.env, CRON_SECRET: e2eCronSecret, RAZORPAY_WEBHOOK_SECRET: e2eRazorpayWebhookSecret },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
