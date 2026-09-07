import { Linking, Platform } from "react-native";

export function openExternal(url?: string | null) {
  if (!url) return;
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  Linking.openURL(url).catch(() => {});
}
