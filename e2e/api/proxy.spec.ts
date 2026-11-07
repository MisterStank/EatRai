import { test, expect } from "@playwright/test";
import { ALLOWED_ORIGIN } from "../playwright.config";

// These run against the real Go proxy (started by playwright.config.ts in mock
// mode: no Google key, no Places calls). The server's rate limiter keys on the
// client IP, taken from the last X-Forwarded-For entry, so each test sends a
// fresh random IP to stay independent of the others and of repeated runs.
const octet = () => Math.floor(Math.random() * 254) + 1;
const freshIP = () => ({ "X-Forwarded-For": `10.${octet()}.${octet()}.${octet()}` });

const NEARBY = "/nearby?lat=13.7367&lng=100.532";

test("GET /status reports a healthy server in mock mode", async ({ request }) => {
  const res = await request.get("/status");

  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, mock: true });
});

test("allowed origin gets cards and a matching CORS header", async ({ request }) => {
  const res = await request.get(NEARBY, {
    headers: { Origin: ALLOWED_ORIGIN, ...freshIP() },
  });

  expect(res.status()).toBe(200);
  expect(res.headers()["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  const body = await res.json();
  expect(Array.isArray(body.cards)).toBe(true);
  expect(body.cards.length).toBeGreaterThan(0);
});

test("unknown origin is rejected with 403 and no CORS header", async ({ request }) => {
  const res = await request.get(NEARBY, {
    headers: { Origin: "https://evil.example", ...freshIP() },
  });

  expect(res.status()).toBe(403);
  expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  expect(await res.json()).toEqual({ error: "not allowed from this origin" });
});

test("too many requests from one IP get 429 with Retry-After", async ({ request }) => {
  // The server is started with RATE_LIMIT_RPM=5.
  const headers = { Origin: ALLOWED_ORIGIN, ...freshIP() };
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await request.get(NEARBY, { headers })).status());
  }

  expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
  expect(statuses[5]).toBe(429);
  const blocked = await request.get(NEARBY, { headers });
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBe("60");
});
