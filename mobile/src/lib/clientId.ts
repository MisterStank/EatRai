import { newSessionToken } from "./uuid";

// A stable per-browser id, sent as the X-EatRai-Client header so the backend's
// per-client request quota (docs/COST_AND_MONETIZATION_PLAN.md Part 12) keys on
// ip+token rather than ip alone — so co-NATed users each get their own budget.
// Not a security token: it's spoofable, and the server has an outer per-IP cap.

const KEY = "eatrai:client";
let cached: string | null = null;

export function clientId(): string {
  if (cached) return cached;
  try {
    const ls: Storage | undefined = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (ls) {
      let v = ls.getItem(KEY);
      if (!v) {
        v = newSessionToken();
        ls.setItem(KEY, v);
      }
      cached = v;
      return v;
    }
  } catch {
    // private mode / storage disabled — fall through to an in-memory id
  }
  cached = newSessionToken();
  return cached;
}
