import { getNearby, getPlace, getList, suggest, geocode, reverseGeocode } from "./client";

function mockFetchOnce(status: number, body: any) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("getNearby", () => {
  test("builds query params from opts and returns cards", async () => {
    mockFetchOnce(200, { cards: [{ id: "1" }] });
    const cards = await getNearby(13.75, 100.5, {
      radiusM: 2000,
      categories: ["thai", "cafe"],
      openNow: true,
      minRating: 4,
      priceLevels: [1, 2],
      sort: "match",
      lang: "th",
    });
    expect(cards).toEqual([{ id: "1" }]);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("lat=13.75");
    expect(url).toContain("lng=100.5");
    expect(url).toContain("radius=2000");
    expect(url).toContain("categories=thai%2Ccafe");
    expect(url).toContain("openNow=true");
    expect(url).toContain("minRating=4");
    expect(url).toContain("priceLevels=1%2C2");
    expect(url).toContain("sort=match");
    expect(url).toContain("lang=th");
  });

  test("omits lang param for English (the default)", async () => {
    mockFetchOnce(200, { cards: [] });
    await getNearby(13.75, 100.5, { lang: "en" });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).not.toContain("lang=");
  });

  test("returns an empty array when the server omits cards", async () => {
    mockFetchOnce(200, {});
    expect(await getNearby(0, 0)).toEqual([]);
  });

  test("429 maps to a TOO_MANY error", async () => {
    mockFetchOnce(429, { error: "slow down" });
    await expect(getNearby(0, 0)).rejects.toThrow("TOO_MANY");
  });

  test("other error statuses surface the server's message", async () => {
    mockFetchOnce(500, { error: "boom" });
    await expect(getNearby(0, 0)).rejects.toThrow("boom");
  });

  test("falls back to a generic message when the error body has none", async () => {
    mockFetchOnce(500, {});
    await expect(getNearby(0, 0)).rejects.toThrow("Couldn't load restaurants (500)");
  });
});

describe("getPlace", () => {
  test("includes lat/lng only when both are given", async () => {
    mockFetchOnce(200, { id: "1", name: "Test" });
    await getPlace("1", { lat: 13.75, lng: 100.5 });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("lat=13.75");
    expect(url).toContain("lng=100.5");
  });

  test("omits lat/lng when only one is given", async () => {
    mockFetchOnce(200, { id: "1" });
    await getPlace("1", { lat: 13.75 });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).not.toContain("lat=");
    expect(url).not.toContain("lng=");
  });

  test("throws on error status", async () => {
    mockFetchOnce(404, { error: "not found" });
    await expect(getPlace("nope")).rejects.toThrow("not found");
  });
});

describe("getList", () => {
  test("short-circuits with no fetch for an empty id list", async () => {
    const cards = await getList([]);
    expect(cards).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("caps at 25 ids", async () => {
    mockFetchOnce(200, { places: [] });
    const ids = Array.from({ length: 30 }, (_, i) => `id${i}`);
    await getList(ids);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const sent = decodeURIComponent(url.split("ids=")[1]).split(",");
    expect(sent).toHaveLength(25);
  });

  test("returns places from the response", async () => {
    mockFetchOnce(200, { places: [{ id: "a" }, { id: "b" }] });
    expect(await getList(["a", "b"])).toEqual([{ id: "a" }, { id: "b" }]);
  });
});

describe("suggest", () => {
  test("short-circuits with no fetch for a too-short query", async () => {
    const sugs = await suggest("a", { token: "tok" });
    expect(sugs).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("returns suggestions on success", async () => {
    mockFetchOnce(200, { suggestions: [{ placeId: "p1", primaryText: "A", secondaryText: "B" }] });
    const sugs = await suggest("thong", { token: "tok" });
    expect(sugs).toEqual([{ placeId: "p1", primaryText: "A", secondaryText: "B" }]);
  });

  test("soft-fails to an empty array on error status (never throws)", async () => {
    mockFetchOnce(500, {});
    await expect(suggest("thong", { token: "tok" })).resolves.toEqual([]);
  });
});

describe("geocode", () => {
  test("uses placeId + token over free text when placeId is given", async () => {
    mockFetchOnce(200, { lat: 1, lng: 2, label: "X" });
    await geocode("ignored free text", { placeId: "p1", token: "tok" });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("placeId=p1");
    expect(url).toContain("token=tok");
    expect(url).not.toContain("q=");
  });

  test("uses free text when no placeId is given", async () => {
    mockFetchOnce(200, { lat: 1, lng: 2, label: "X" });
    await geocode("Thonglor");
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("q=Thonglor");
  });

  test("throws on error status", async () => {
    mockFetchOnce(404, { error: "couldn't find that place" });
    await expect(geocode("nowhere")).rejects.toThrow("couldn't find that place");
  });
});

describe("reverseGeocode", () => {
  test("returns the label on success", async () => {
    mockFetchOnce(200, { label: "Siam" });
    expect(await reverseGeocode(13.75, 100.5)).toEqual({ label: "Siam" });
  });

  test("soft-fails to an empty label on error status (never throws)", async () => {
    mockFetchOnce(500, {});
    await expect(reverseGeocode(13.75, 100.5)).resolves.toEqual({ label: "" });
  });
});
