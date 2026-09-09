/**
 * @jest-environment jsdom
 */
import { readStartLocation } from "./startLocation";

const setSearch = (s: string) => {
  Object.defineProperty(window, "location", { value: { search: s }, writable: true, configurable: true });
};

describe("readStartLocation", () => {
  test("reads ?lat&lng&area from a Part 15 deep link", () => {
    setSearch("?lat=13.7295&lng=100.5817&area=Thong%20Lo");
    expect(readStartLocation()).toEqual({ lat: 13.7295, lng: 100.5817, label: "Thong Lo" });
  });

  test("area is optional", () => {
    setSearch("?lat=18.79&lng=98.99");
    expect(readStartLocation()).toEqual({ lat: 18.79, lng: 98.99, label: undefined });
  });

  test("null when params are missing, non-numeric, out of range, or null island", () => {
    for (const s of ["", "?foo=bar", "?lat=abc&lng=100", "?lat=200&lng=100", "?lat=0&lng=0"]) {
      setSearch(s);
      expect(readStartLocation()).toBeNull();
    }
  });
});
