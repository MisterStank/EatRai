import { Platform } from "react-native";
import type { Card } from "../api/client";

const SHARE_BASE = "https://eatrai.help";

// A shared list is just the Google place IDs, comma-joined, in the URL.
// eatrai.help/list?ids=ChIJ...,ChIJ...
export function buildShareURL(cards: Card[]): string {
  const ids = cards.map((c) => c.id).slice(0, 25);
  return `${SHARE_BASE}/list?ids=${encodeURIComponent(ids.join(","))}`;
}

// Read the shared-list IDs from the current URL, web only. Native returns null
// (deep links are handled separately if we add them).
export function parseSharedList(): { ids: string[] } | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const { pathname, search } = window.location;
  if (!pathname.startsWith("/list")) return null;
  const raw = new URLSearchParams(search).get("ids");
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? { ids } : null;
}
