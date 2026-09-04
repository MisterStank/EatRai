import { buildShareURL, parseSharedList } from "./sharing";
import type { Card } from "../api/client";

function card(id: string): Card {
  return {
    id,
    name: id,
    address: "",
    priceLevel: 0,
    priceRange: null,
    rating: 0,
    ratingCount: 0,
    photoUrls: [],
    cuisines: [],
    distanceM: 0,
    openNow: false,
    openKnown: false,
    mapsUri: "",
  };
}

describe("buildShareURL", () => {
  test("joins place ids into the /list URL", () => {
    const url = buildShareURL([card("a"), card("b")]);
    expect(url).toBe("https://eatrai.help/list?ids=a%2Cb");
  });

  test("caps at 25 ids", () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(`id${i}`));
    const url = buildShareURL(cards);
    const ids = decodeURIComponent(url.split("ids=")[1]).split(",");
    expect(ids).toHaveLength(25);
    expect(ids[0]).toBe("id0");
  });
});

describe("parseSharedList", () => {
  test("parses ids from a full URL", () => {
    expect(parseSharedList("https://eatrai.help/list?ids=a,b,c")).toEqual({ ids: ["a", "b", "c"] });
  });

  test("returns null for a non-list URL", () => {
    expect(parseSharedList("https://eatrai.help/other?ids=a,b")).toBeNull();
  });

  test("returns null when ids param is missing", () => {
    expect(parseSharedList("https://eatrai.help/list")).toBeNull();
  });

  test("trims whitespace and drops empty entries", () => {
    expect(parseSharedList("https://eatrai.help/list?ids=a, b ,,c")).toEqual({ ids: ["a", "b", "c"] });
  });

  test("matches a native deep link too", () => {
    expect(parseSharedList("eatrai://list?ids=x,y")).toEqual({ ids: ["x", "y"] });
  });
});
