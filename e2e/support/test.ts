import { test as base, expect, type Page } from "@playwright/test";
import { MOCK_API } from "../playwright.config";
import nearby3 from "../fixtures/nearby-3.json";
import reverse from "../fixtures/reverse.json";

type ApiResponse = { status?: number; json: unknown; headers?: Record<string, string> };

type Fixtures = {
  /**
   * Answers the app's calls to the Go proxy from JSON fixtures.
   * Defaults: /nearby → 3 cards, /reverse → "Samyan". Override per test, e.g.
   * `await mockApi({ nearby: { status: 429, json: { error: "slow down" } } })`.
   * Call it before page.goto().
   */
  mockApi: (overrides?: { nearby?: ApiResponse }) => Promise<void>;
};

// The app's persisted Zustand session (AsyncStorage → localStorage on web).
const SESSION_KEY = "eatrai-session-v1";

export const test = base.extend<Fixtures>({
  // Runs for every test: English UI, first-visit guide popup and swipe hint
  // already dismissed. Only written when the key is absent, so a page.reload()
  // keeps whatever the app itself saved — which is what the persistence test
  // relies on.
  page: async ({ page }, use) => {
    await page.addInitScript(
      ({ key }) => {
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(
            key,
            JSON.stringify({ state: { lang: "en", guideSeen: true, hintSeen: true }, version: 0 }),
          );
        }
      },
      { key: SESSION_KEY },
    );
    // Vercel Analytics isn't served by the static test server; keep it out.
    await page.route("**/_vercel/**", (route) => route.abort());
    await use(page);
  },

  mockApi: async ({ page }, use) => {
    await use(async (overrides = {}) => {
      await page.route(`${MOCK_API}/**`, async (route) => {
        // /nearby sends a custom X-EatRai-Client header, so the browser may
        // preflight it. Answer the preflight the way the Go proxy would.
        if (route.request().method() === "OPTIONS") {
          return route.fulfill({
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "*",
            },
          });
        }
        const path = new URL(route.request().url()).pathname;
        const reply = (r: ApiResponse) =>
          route.fulfill({
            status: r.status ?? 200,
            json: r.json,
            // The app runs on another origin, so real CORS headers are needed.
            headers: { "Access-Control-Allow-Origin": "*", ...r.headers },
          });

        if (path === "/nearby") return reply(overrides.nearby ?? { json: nearby3 });
        if (path === "/reverse") return reply({ json: reverse });
        // Anything else is a call this suite doesn't expect — fail it visibly.
        return route.fulfill({ status: 599, body: `unmocked ${path}` });
      });
    });
  },
});

export { expect };

/** The interactive top card of the deck (only the top card carries this label). */
export const topCard = (page: Page) => page.getByLabel(/Swipe right to save, left to pass\.$/);
