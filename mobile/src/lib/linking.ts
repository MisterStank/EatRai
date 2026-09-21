import { Linking, Platform } from "react-native";

// sameTab: web only — navigate the current tab instead of opening a new one.
// Used for our own /support page, which has a "Back to EatRai" link; external
// sites (maps, feedback form) keep opening in a new tab so the deck survives.
export function openExternal(url?: string | null, opts?: { sameTab?: boolean }) {
  if (!url) return;
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const a = document.createElement("a");
    a.href = url;
    if (!opts?.sameTab) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  Linking.openURL(url).catch(() => {});
}
