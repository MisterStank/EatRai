import { Platform } from "react-native";
import type { Card } from "../api/client";

const SHARE_BASE = "https://eatrai.help";

// A shared list is just the Google place IDs, comma-joined, in the URL.
// eatrai.help/list?ids=ChIJ...,ChIJ...  (native deep link: eatrai://list?ids=...)
export function buildShareURL(cards: Card[]): string {
  const ids = cards.map((c) => c.id).slice(0, 25);
  return `${SHARE_BASE}/list?ids=${encodeURIComponent(ids.join(","))}`;
}

// parseSharedList pulls the shared-list IDs out of a URL. Pass a URL string
// (native deep link); pass nothing on web to read window.location.
export function parseSharedList(url?: string | null): { ids: string[] } | null {
  let isList = false;
  let query = "";

  if (url) {
    isList = /(^|[/:])list(\?|$|\/)/i.test(url);
    const q = url.indexOf("?");
    query = q >= 0 ? url.slice(q + 1) : "";
  } else if (Platform.OS === "web" && typeof window !== "undefined") {
    isList = window.location.pathname.startsWith("/list");
    query = window.location.search.replace(/^\?/, "");
  } else {
    return null;
  }
  if (!isList) return null;

  const raw = new URLSearchParams(query).get("ids");
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? { ids } : null;
}
