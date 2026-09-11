import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { ADSENSE_CLIENT, adSlotId } from "../lib/adsConfig";

// A single AdSense display unit, web-only. See docs/COST_AND_MONETIZATION_PLAN.md
// Part 11.1. It is NEVER a gate: whatever renders it (a deck card, the detail
// sheet, the end-of-deck state) stays swipeable / scrollable. Renders `null`
// on native (ads are web-only, out of scope). On web, when there's no real ad
// to show (not configured yet, or this slot went unfilled, or — deck only —
// the 60-second frequency cap is active) it shows a small branded filler
// instead of blank space, so the card never looks broken pre-AdSense-approval.
//
// No fade-in (removed 2026-09-11): verified against Google's own viewability
// docs that Active View measures DOM/viewport position, not CSS opacity, so a
// fade bought no actual viewable-impression time — it was cosmetic only. Cut
// for simplicity. The in-deck slot's forced-dwell mechanism is now the "Skip
// ad" button's countdown (DeckScreen + ActionBar), which never blocks swipe.

export type AdSlot = "deck" | "detail" | "done" | "seo";

const AD_SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
const DECK_MIN_GAP_MS = 60_000;

// module state, shared across mounts
let scriptRequested = false;
let lastDeckAdAt = 0;

function ensureScript(client: string) {
  if (scriptRequested || typeof document === "undefined") return;
  scriptRequested = true;
  if (document.querySelector("script[data-eatrai-adsense]")) return;
  const s = document.createElement("script");
  s.src = `${AD_SCRIPT}?client=${encodeURIComponent(client)}`;
  s.async = true;
  s.crossOrigin = "anonymous";
  s.setAttribute("data-eatrai-adsense", "");
  document.head.appendChild(s);
}

// deckGapOK — exported for tests; the 60s cap only applies to the in-deck slot.
export function deckGapOK(now = Date.now()): boolean {
  return now - lastDeckAdAt >= DECK_MIN_GAP_MS;
}

function AdFallback() {
  const t = useT();
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackEmoji}>🍜🎉</Text>
      <Text style={styles.fallbackBrand}>{t("adFallbackBrand")}</Text>
      <Text style={styles.fallbackSupport}>{t("adFallbackSupport")}</Text>
    </View>
  );
}

export function AdCard({ slot, style }: { slot: AdSlot; style?: object }) {
  const insRef = useRef<HTMLModElement | null>(null);
  const [unfilled, setUnfilled] = useState(false);

  // Web-only: native RN has no `document`, so this is false there.
  const isWeb = typeof document !== "undefined";
  const slotId = adSlotId(slot);
  const configured = isWeb && !!ADSENSE_CLIENT && !!slotId;
  const enabled = configured && (slot !== "deck" || deckGapOK());

  useEffect(() => {
    if (!enabled) return;
    ensureScript(ADSENSE_CLIENT as string);
    if (slot === "deck") lastDeckAdAt = Date.now();
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle not ready yet — it drains its own queue when the script loads
    }
    const check = setTimeout(() => {
      if (insRef.current?.getAttribute("data-ad-status") === "unfilled") setUnfilled(true);
    }, 2500);
    return () => clearTimeout(check);
  }, [enabled, slot]);

  if (!isWeb) return null;

  if (!enabled || unfilled) {
    return (
      <View style={[styles.wrap, style]}>
        <AdFallback />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      {React.createElement("ins", {
        ref: insRef,
        className: "adsbygoogle",
        style: { display: "block", width: "100%", height: "100%" },
        "data-ad-client": ADSENSE_CLIENT,
        "data-ad-slot": slotId,
        "data-ad-format": "auto",
        "data-full-width-responsive": "true",
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 120,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: color.surfaceAlt,
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space(4),
    gap: space(1.5),
  },
  fallbackEmoji: { fontSize: 32 },
  fallbackBrand: { fontFamily: font.displaySemi, fontSize: 16, color: color.inkSoft, textAlign: "center" },
  fallbackSupport: { fontFamily: font.bodyReg, fontSize: 13, color: color.inkFaint, textAlign: "center" },
});
