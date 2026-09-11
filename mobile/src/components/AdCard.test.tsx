/**
 * @jest-environment jsdom
 */
// AdCard is web-only and touches the DOM (injects the AdSense <script>, reads
// data-ad-status off the <ins>). jsdom + a mocked adsConfig lets us exercise it.

jest.mock("../lib/adsConfig", () => ({
  ADSENSE_CLIENT: "ca-pub-testclient",
  adSlotId: (slot: string) =>
    ({ deck: "1111111111", detail: "2222222222" } as Record<string, string>)[slot],
  deckAdsEnabled: () => true,
}));

import React from "react";
import { render } from "@testing-library/react-native";
import { AdCard, deckGapOK } from "./AdCard";

const opts = { createNodeMock: () => ({ getAttribute: () => null }) };

// walk the react-test-renderer JSON tree for host-tag <ins> nodes
function findIns(json: unknown, out: any[] = []): any[] {
  const nodes = Array.isArray(json) ? json : json ? [json] : [];
  for (const n of nodes as any[]) {
    if (n && typeof n === "object") {
      if (n.type === "ins") out.push(n);
      if (n.children) findIns(n.children, out);
    }
  }
  return out;
}
const inses = (r: ReturnType<typeof render>) => findIns(r.toJSON());

describe("AdCard", () => {
  test("renders an adsbygoogle <ins> with the slot id when configured", () => {
    const r = render(<AdCard slot="detail" />, opts);
    const found = inses(r);
    expect(found).toHaveLength(1);
    expect(found[0].props.className).toBe("adsbygoogle");
    expect(found[0].props["data-ad-slot"]).toBe("2222222222");
    expect(found[0].props["data-ad-client"]).toBe("ca-pub-testclient");
  });

  test("shows the branded filler (not blank/null) for a slot with no configured id", () => {
    const r = render(<AdCard slot="seo" />, opts);
    expect(inses(r)).toHaveLength(0);
    expect(r.toJSON()).not.toBeNull();
    expect(r.getByText(/MisterStank/)).toBeTruthy();
    expect(r.getByText(/eatrai\.help\/support/)).toBeTruthy();
  });

  test("injects the AdSense script exactly once across multiple mounts", () => {
    render(<AdCard slot="detail" />, opts);
    render(<AdCard slot="detail" />, opts);
    expect(document.querySelectorAll("script[data-eatrai-adsense]")).toHaveLength(1);
    const src = document.querySelector("script[data-eatrai-adsense]")?.getAttribute("src") ?? "";
    expect(src).toContain("adsbygoogle.js");
    expect(src).toContain("client=ca-pub-testclient");
  });

  test("deck slot honours a 60s frequency cap", () => {
    expect(deckGapOK()).toBe(true); // nothing shown yet
    render(<AdCard slot="deck" />, opts); // shows -> starts the cap
    expect(deckGapOK()).toBe(false);
    // a second deck ad within the window renders nothing
    expect(inses(render(<AdCard slot="deck" />, opts))).toHaveLength(0);
    // the cap is deck-only — the detail slot is unaffected
    expect(inses(render(<AdCard slot="detail" />, opts))).toHaveLength(1);
  });
});
