import type { Card } from "../api/client";

// weightedPick chooses one card at random, biased toward higher ratings and
// closer places, so "Decide for me" feels like a good pick rather than a coin
// flip. `avoid` keeps a re-roll from landing on the same place twice.
export function weightedPick(cards: Card[], avoid?: string): Card | null {
  if (!cards.length) return null;
  const pool = avoid && cards.length > 1 ? cards.filter((c) => c.id !== avoid) : cards;
  const list = pool.length ? pool : cards;

  const weight = (c: Card) => {
    const r = c.rating > 0 ? c.rating : 3.6; // unrated → middling
    const quality = Math.max(0.15, r - 3.2); // ~0.15 .. 1.8
    const near =
      c.distanceM > 0 ? Math.max(0.35, 1 - c.distanceM / 4000) : 0.7; // fades with distance
    return quality * near;
  };

  const total = list.reduce((s, c) => s + weight(c), 0);
  let x = Math.random() * total;
  for (const c of list) {
    x -= weight(c);
    if (x <= 0) return c;
  }
  return list[list.length - 1];
}
