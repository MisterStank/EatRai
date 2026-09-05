---
name: testing
description: Testing conventions and environment gotchas for EatRai's backend (Go) and mobile (Expo/jest) suites. Use when writing a new test in either package, a jest test times out or hangs for no obvious reason, adding a test for a *.web.tsx file, mocking a call to Google Places or fetch, or fixing a bug that needs a regression test.
---

# EatRai testing conventions

Run with `go test ./...` (backend) and `npm test` (mobile — already wraps `jest --maxWorkers=2`, see Slow environment below). Coverage: `go test -cover ./...` / `npx jest --coverage`; never commit the output (already gitignored).

## Regression-test discipline

For any fix to a subtle bug (timing, state, security) — not a typo-level fix — prove the test before trusting it: revert the fix, run the new test, confirm it fails, then restore the fix and confirm it passes. A test that never failed against the broken code might be passing for the wrong reason. This caught a real false positive in this codebase: an early draft asserted `.props.disabled` on a `Pressable`, which is `undefined` whether or not the button is actually disabled (RN's `Pressable` never forwards `disabled` as a literal prop) — the assertion trivially passed either way. Use `.props.accessibilityState?.disabled` instead; that field is the one RN's own accessibility layer relies on, so it's genuinely meaningful.

## Backend (Go)

Three tiers, by what's under test:

- **Pure logic** (`places_test.go`, `ratelimit_test.go`): plain table-driven tests, no mocking.
- **HTTP layer** (`internal/httpapi/*_test.go`): `httptest.NewServer(srv.Router())` against a `Server{Mock: true, ...}` built by the `newTestServer` helper in `server_test.go`. Mock mode makes every handler serve from `internal/places/mock.go`'s curated dataset — no real Google call, no API key needed. This is also how to catch a route-wiring bug (a handler registered outside the middleware group it should sit behind): an HTTP-level test through the real `Router()` catches that; a test that calls the handler function directly does not.
- **Real Google-API-calling functions** (`internal/places/client_test.go`, e.g. `Search`, `GetPlace`, `Autocomplete`): fake the transport, not the URL. Swap `Client.HTTP.Transport` for a `roundTripFunc` (see `testClient` in that file) that returns canned JSON per request. This needs zero changes to production code — no injectable base URL, no real server — because it intercepts one layer below the URL, at the `http.RoundTripper` interface.

## Mobile (Expo / jest-expo / React Native Testing Library)

### Slow environment — read this before assuming a test is broken

This environment (WSL, mounted drive) has real jest-expo cold-transform overhead: a single component-test file can legitimately take 50–90s, and one async test body can legitimately take 10-15s of real wall-clock work. Two consequences, both already wired in but worth knowing when a test "mysteriously" times out:
- `npm test` always runs with `--maxWorkers=2` — the jest default (one worker per core) has OOM-killed the whole run here.
- Any test with an async `waitFor`/effect chain needs an explicit timeout well above the 5000ms default — `test("...", async () => {...}, 30000)`. A failure whose message is "Exceeded timeout of 5000ms" almost always means "raise the timeout," not "the code is broken" — check the test actually failed on its assertion, not the clock, before debugging the wrong thing.

### Mocks (`jest.setup.js`)

Already wired: `@react-native-async-storage/async-storage` (official jest mock — real in-memory get/set, so persistence round-trips are genuinely testable), `expo-location`/`expo-haptics`/`expo-font`, `react-native-reanimated` (official mock, patched with `useReducedMotion` which that mock omits), `react-native-gesture-handler` (`jestSetup`), and `react-native-safe-area-context` — **its official mock is ESM-default-exported**, so the factory must unwrap `.default`, or every named export (`SafeAreaProvider`, `useSafeAreaInsets`, ...) comes back `undefined` and any component using them silently renders no children at all (not an error — just an empty tree, confusing to debug).

For a network call, mock the function, not `fetch` globally, unless the file under test *is* `api/client.ts` itself:
```ts
jest.mock("../api/client", () => ({
  ...jest.requireActual("../api/client"),
  getPlace: jest.fn(() => Promise.reject(new Error("no network in tests"))),
}));
```

### Testing a `*.web.tsx` file

jest-expo's haste config resolves only the `ios`/`android`/`native` platform suffixes — never `web` — so a component that only exists as `Foo.web.tsx` is invisible to every other test in the suite by default, even though it may be exactly what ships to production (eatrai.help is a web deployment). Don't reconfigure haste globally (it'd change platform resolution for the whole suite, including files that don't need it). Instead, per test file:
1. Import by the explicit filename: `import { Foo } from "./Foo.web"` — resolves directly, bypassing platform selection.
2. If the component touches real DOM APIs (e.g. injecting a `<script>` tag), add `/** @jest-environment jsdom */` at the top of *that file only*. The rest of the suite stays on RN's own test environment.
3. `@testing-library/react-native` renders through `react-test-renderer`, not `react-dom` — a literal HTML tag like `React.createElement("div", {ref})` never gets a real DOM node, so `ref.current` is `null` and any code gated on it (`if (!ref.current) return`) silently no-ops. Pass `{ createNodeMock: () => ({}) }` as `render()`'s second argument to make every host-tag ref resolve to a truthy stub instead.

### Self-resetting module caches

A module-level cache (`let cached = null` outside the component, set once and reused — e.g. `MapLocationScreen.web.tsx`'s MapLibre-script-load promise) persists across every test in the same file, because jest doesn't reset the module registry between tests by default. `jest.resetModules()` looks like the fix but isn't: it also resets `react` itself, so a component re-`require`d afterward can end up on a different React instance than the one your test file imported — hooks break in ways that don't look like a caching problem. If the cache under test resets *itself* on a failure path (check for it — this one nulls its promise in the `onerror`/`catch` branch), order the failing-path test first in the file; it leaves the module clean for the tests after it, with no framework trickery needed.
