import { defineConfig, devices } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testData = mkdtempSync(join(tmpdir(), "endodelivery-e2e-"));
// A production binding must never be inherited by the test server.
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const cloudBrowser = process.env.CLOUD_BROWSER_TESTS === "1";
// This application does not use WebGL; software GPU rendering stalls in this cloud runner.
if (cloudBrowser) chromium.setGraphicsMode = false;
const executablePath = cloudBrowser ? await chromium.executablePath() : undefined;
const cloudBrowserArgs = chromium.args.filter((argument) => ![
  "--disable-web-security", "--allow-running-insecure-content", "--disable-site-isolation-trials",
].includes(argument));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: process.env.CAPTURE_UI === "1" ? 120_000 : 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: cloudBrowser ? { executablePath, args: cloudBrowserArgs } : {},
  },
  projects: [
    { name: "api", testMatch: "api.spec.ts" },
    { name: "desktop", testMatch: "ui.spec.ts", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: "ui.spec.ts", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_PROVIDER: testDatabaseUrl ? "postgres" : "sqlite",
      DATABASE_URL: testDatabaseUrl,
      POSTGRES_URL: "",
      VERCEL: "",
      STORAGE_PROVIDER: "local",
      BLOB_READ_WRITE_TOKEN: "",
      DATABASE_PATH: join(testData, "clinic.sqlite"),
      FILE_STORAGE_PATH: join(testData, "uploads"),
      APP_ORIGIN: "http://localhost:3100",
    },
  },
});
