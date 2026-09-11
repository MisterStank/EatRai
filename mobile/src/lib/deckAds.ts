import type { Card, DeckItem } from "../api/client";

// One ad sentinel after every AD_EVERY real cards — but never as the trailing
// item (an ad shouldn't be the last thing before "you're done"). Part 11.1.
export const AD_EVERY = 5;

// The in-deck ad is locked for this long after it becomes the top card: the
// "Skip ad" button is disabled with a countdown, and swipe is disabled too
// (SwipeCard's adSwipeLocked). Chosen after a live A/B trial against a
// button-only gate — the accepted risk is documented in plan Part 11.1e.
export const AD_SKIP_DELAY_MS = 3000;

export function spliceAds(deck: Card[], enabled: boolean): DeckItem[] {
  if (!enabled) return deck;
  const out: DeckItem[] = [];
  deck.forEach((c, i) => {
    out.push(c);
    if ((i + 1) % AD_EVERY === 0 && i < deck.length - 1) {
      out.push({ id: `__ad_${i + 1}`, isAd: true });
    }
  });
  return out;
}
