import { getNearby, getPlace, getList, suggest, geocode, reverseGeocode } from "./client";

function mockFetchOnce(status: number, body: any) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchAlways(status: number, body: any) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

// A server card with everything the client needs; override per test.
function srvCard(over: Partial<any> = {}) {
  return {
    id: "1",
    name: "Place",
    address: "",
    priceLevel: 0,
    priceRange: null,
    rating: 4.5,
    ratingCount: 100,
    photoUrls: [],
    cuisines: [],
    location: { lat: 13.75, lng: 100.5 },
    distanceM: 0,
    openNow: true,
    openKnown: true,
    mapsUri: "",
    ...over,
  };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("getNearby", () => {
  test("snaps coords to the grid and sends only cell/cuisine/lang on the wire", async () => {
    mockFetchAlways(200, { cards: [] });
    await getNearby(13.7461, 100.5341, {
      radiusM: 2000,
      categories: ["thai"],
      openNow: true,
      minRating: 4,
      priceLevels: [1, 2],
      sort: "match",
      lang: "th",
    });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("lat=13.746"); // snapped from 13.7461
    expect(url).toContain("lng=100.533"); // snapped from 100.5341
    expect(url).toContain("cuisine=thai");
    expect(url).toContain("lang=th");
    // client-side concerns never hit the wire
    expect(url).not.toContain("openNow");
    expect(url).not.toContain("minRating");
    expect(url).not.toContain("priceLevels");
    expect(url).not.toContain("sort");
    expect(url).not.toContain("radius="); // 2000 buckets to 5000 (the default) → omitted
  });

  test("fires one request per selected cuisine and merges + de-dupes by id", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ cards: [srvCard({ id: "a" }), srvCard({ id: "b" })] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ cards: [srvCard({ id: "b" }), srvCard({ id: "c" })] }) });
    const cards = await getNearby(13.75, 100.5, { categories: ["thai", "cafe"] });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(cards.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("sends radius only when the bucket differs from the 5 km default", async () => {
    mockFetchAlways(200, { cards: [] });
    await getNearby(13.75, 100.5, { radiusM: 12000 });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("radius=20000"); // 12000 → 20000 bucket
  });

  test("computes distance client-side from location + true (unsnapped) position", async () => {
    // place ~1.1 km due north of the true position
    mockFetchOnce(200, { cards: [srvCard({ id: "x", location: { lat: 13.75 + 0.01, lng: 100.5 } })] });
    const [card] = await getNearby(13.75, 100.5, { radiusM: 5000 });
    expect(card.distanceM).toBeGreaterThan(900);
    expect(card.distanceM).toBeLessThan(1300);
  });

  test("applies radius / rating / price / open-now filters client-side", async () => {
    mockFetchOnce(200, {
      cards: [
        srvCard({ id: "far", distanceM: 8000, location: { lat: 0, lng: 0 } }),
        srvCard({ id: "lowrating", rating: 3.0, distanceM: 100, location: { lat: 0, lng: 0 } }),
        srvCard({ id: "pricey", priceLevel: 4, distanceM: 100, location: { lat: 0, lng: 0 } }),
        srvCard({ id: "unknownprice", priceLevel: 0, distanceM: 100, location: { lat: 0, lng: 0 } }),
        srvCard({ id: "closed", openKnown: true, openNow: false, distanceM: 100, location: { lat: 0, lng: 0 } }),
        srvCard({ id: "keep", rating: 4.5, priceLevel: 2, distanceM: 100, location: { lat: 0, lng: 0 } }),
      ],
    });
    const cards = await getNearby(13.75, 100.5, {
      radiusM: 3000,
      minRating: 4,
      priceLevels: [1, 2],
      openNow: true,
    });
    expect(cards.map((c) => c.id).sort()).toEqual(["keep", "unknownprice"]);
  });

  test("sort=match re-orders by rating × log(ratingCount)", async () => {
    mockFetchOnce(200, {
      cards: [
        srvCard({ id: "few", rating: 4.9, ratingCount: 3, distanceM: 100, location: { lat: 0, lng: 0 } }),
        srvCard({ id: "many", rating: 4.4, ratingCount: 5000, distanceM: 900, location: { lat: 0, lng: 0 } }),
      ],
    });
    const cards = await getNearby(13.75, 100.5, { sort: "match" });
    expect(cards[0].id).toBe("many");
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
