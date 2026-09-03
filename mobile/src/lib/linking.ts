import { Linking, Platform } from "react-native";

// openExternal opens a maps / phone / website link. On web, window.open in a new
// tab keeps the app (and the user's swipe position) intact; if the popup is
// blocked we fall back to navigating the current tab.
export function openExternal(url?: string | null) {
  if (!url) return;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) window.location.href = url;
    return;
  }
  Linking.openURL(url).catch(() => {});
}
