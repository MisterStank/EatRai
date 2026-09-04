/**
 * @jest-environment jsdom
 *
 * MapLocationScreen.web.tsx is the picker that actually ships on eatrai.help
 * (a web deployment) — but jest-expo's haste config only resolves the
 * ios/android/native platform suffixes, never "web", so the rest of the
 * suite never touches this file. Importing it by its explicit filename here
 * bypasses that resolution entirely, and the jsdom environment (this file
 * only — the rest of the suite stays on the RN test environment) gives the
 * real `document`/`window` this component needs for its CDN-script-loading
 * MapLibre bootstrap. AreaSearch and the MapLibre load itself are mocked —
 * this covers MapLocationScreen's own ready/failed/label/confirm state
 * machine, not AreaSearch's or MapLibre's internals.
 *
 * The component caches its MapLibre-load promise in a module-level variable
 * (deliberately — load once per app session), but resets that cache itself
 * when the load fails. Rather than fight the cache with jest.resetModules()
 * (which risks a duplicate React instance and breaks hooks), these two tests
 * run in declaration order: the failure case first, which leaves the module
 * in a clean state for the success case that follows.
 */
import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { MapLocationScreen } from "./MapLocationScreen.web";

jest.mock("./AreaSearch", () => ({
  AreaSearch: () => null,
}));

const mockReverseGeocode = jest.fn();
jest.mock("../api/client", () => ({
  ...jest.requireActual("../api/client"),
  reverseGeocode: (...args: any[]) => mockReverseGeocode(...args),
}));

// A minimal fake of the maplibre-gl `Map` API surface this component uses.
class FakeMap {
  static instances: FakeMap[] = [];
  handlers: Record<string, ((...a: any[]) => void)[]> = {};
  constructor(public opts: any) {
    FakeMap.instances.push(this);
  }
  on(event: string, cb: (...a: any[]) => void) {
    (this.handlers[event] ??= []).push(cb);
  }
  fire(event: string, ...args: any[]) {
    (this.handlers[event] ?? []).forEach((cb) => cb(...args));
  }
  resize() {}
  getCenter() {
    return { lat: 13.8, lng: 100.6 };
  }
  remove() {}
  flyTo() {}
}

// document.head accumulates a <script> per load attempt across this file's
// tests (jsdom's document isn't reset between tests) — always target the
// most recently created one.
function latestMapLibreScript(): HTMLScriptElement {
  const all = document.querySelectorAll('script[src*="maplibre-gl.js"]');
  return all[all.length - 1] as HTMLScriptElement;
}

beforeEach(() => {
  mockReverseGeocode.mockReset().mockResolvedValue({ label: "Siam" });
});

test(
  "falls back to the non-map form when the MapLibre script fails to load",
  async () => {
    const { getByText } = render(
      <MapLocationScreen visible onClose={() => {}} onConfirm={() => {}} onUseMyLocation={() => {}} />,
      // react-test-renderer never touches real DOM — this raw "div" host tag
      // (see the component's comment on it) has no ref target without a mock.
      { createNodeMock: () => ({}) } as any,
    );

    await waitFor(() => expect(latestMapLibreScript()).toBeTruthy());
    await act(async () => {
      latestMapLibreScript().onerror?.(new Event("error"));
      await Promise.resolve();
    });

    // The failed-state fallback renders LocationForm's "use my location"
    // button, which only exists in that branch — a reliable, unique signal.
    await waitFor(() => expect(getByText("Use my current location")).toBeTruthy());
  },
  30000,
);

test(
  "on success: shows the confirm UI once the map fires 'load', and confirms with the picked label",
  async () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <MapLocationScreen visible onClose={() => {}} onConfirm={onConfirm} onUseMyLocation={() => {}} />,
      { createNodeMock: () => ({}) } as any,
    );

    (window as any).maplibregl = { Map: FakeMap };
    await waitFor(() => expect(latestMapLibreScript()).toBeTruthy());
    const beforeCount = FakeMap.instances.length;
    await act(async () => {
      latestMapLibreScript().onload?.(new Event("load"));
      await Promise.resolve();
    });
    await waitFor(() => expect(FakeMap.instances.length).toBeGreaterThan(beforeCount));

    const map = FakeMap.instances[FakeMap.instances.length - 1];
    act(() => map.fire("load"));

    await waitFor(() => expect(getByText("Search here")).toBeTruthy());

    fireEvent.press(getByText("Search here"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [, label] = onConfirm.mock.calls[0];
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  },
  30000,
);
