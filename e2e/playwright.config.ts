import { defineConfig, devices } from "@playwright/test";

// The web build talks to this host. It doesn't exist: every request to it is
// fulfilled by page.route() in support/test.ts, so a call we forgot to mock
// fails loudly instead of silently reaching a real backend.
export const MOCK_API = "http://api.e2e.test";

const WEB_PORT = 4173;
const API_PORT = 8099;
// The Go server's origin gate only lets this origin through (see api/proxy.spec.ts).
export const ALLOWED_ORIGIN = "http://allowed.e2e.test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  expect: { timeout: 10_000 },

  use: {
    trace: isCI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      testMatch: "ui/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${WEB_PORT}`,
        // Chula / Samyan, Bangkok — inside the app's coverage area, so no
        // "outside coverage" banner appears.
        geolocation: { latitude: 13.7367, longitude: 100.532 },
        permissions: ["geolocation"],
      },
    },
    {
      name: "mobile",
      testMatch: "ui/**/*.spec.ts",
      use: {
        ...devices["Pixel 7"],
        baseURL: `http://localhost:${WEB_PORT}`,
        geolocation: { latitude: 13.7367, longitude: 100.532 },
        permissions: ["geolocation"],
      },
    },
    {
      name: "api",
      testMatch: "api/**/*.spec.ts",
      use: { baseURL: `http://127.0.0.1:${API_PORT}` },
    },
  ],

  webServer: [
    {
      // A production web export served statically — what actually ships to
      // Vercel, and far more stable than the Metro dev server.
      command:
        `cd ../mobile && npx expo export --platform web --output-dir ../e2e/.web-build ` +
        `&& cd ../e2e && npx serve --single --no-clipboard --listen ${WEB_PORT} .web-build`,
      url: `http://localhost:${WEB_PORT}`,
      env: { EXPO_PUBLIC_API_URL: MOCK_API },
      reuseExistingServer: !isCI,
      // The export alone can take ~10 min on a slow (e.g. WSL /mnt) filesystem.
      timeout: 900_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // The real Go proxy in mock mode (no Google key, no Places calls) with a
      // locked-down origin gate and a low rate limit, for the API tests.
      command: "go run ./cmd/api",
      cwd: "../backend",
      url: `http://127.0.0.1:${API_PORT}/status`,
      env: {
        HTTP_ADDR: `127.0.0.1:${API_PORT}`,
        MOCK: "true",
        GOOGLE_PLACES_API_KEY: "",
        CORS_ORIGIN: ALLOWED_ORIGIN,
        REQUIRE_ORIGIN: "true",
        RATE_LIMIT_RPM: "5",
      },
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
