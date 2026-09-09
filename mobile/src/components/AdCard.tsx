import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { color, radius } from "../theme/tokens";
import { ADSENSE_CLIENT, adSlotId } from "../lib/adsConfig";

// A single AdSense display unit, web-only. See docs/COST_AND_MONETIZATION_PLAN.md
// Part 11.1. It is NEVER a gate: whatever renders it (a deck card, the detail
// sheet, the end-of-deck state) stays swipeable / scrollable. A 2-second CSS
// fade-in buys viewable dwell time without blocking anything. Renders `null`
// when: not web, no env config, the slot goes unfilled, or (deck only) the
// 60-second frequency cap is active.

export type AdSlot = "deck" | "detail" | "done" | "seo";

const AD_SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
const FADE_MS = 2000;
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

export function AdCard({ slot, style }: { slot: AdSlot; style?: object }) {
  const insRef = useRef<HTMLModElement | null>(null);
  const [unfilled, setUnfilled] = useState(false);
  const [shown, setShown] = useState(false);

  // Web-only: native RN has no `document`, so this is false there.
  const slotId = adSlotId(slot);
  const configured = typeof document !== "undefined" && !!ADSENSE_CLIENT && !!slotId;
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
    const on = setTimeout(() => setShown(true), 20); // next tick → CSS transition runs
    const check = setTimeout(() => {
      if (insRef.current?.getAttribute("data-ad-status") === "unfilled") setUnfilled(true);
    }, 2500);
    return () => {
      clearTimeout(on);
      clearTimeout(check);
    };
  }, [enabled, slot]);

  if (!enabled || unfilled) return null;

  return (
    <View style={[styles.wrap, style]}>
      {React.createElement("ins", {
        ref: insRef,
        className: "adsbygoogle",
        style: {
          display: "block",
          width: "100%",
          height: "100%",
          opacity: shown ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease`,
        },
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
});
