import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";

export function TopBar({
  locationLabel,
  filterCount,
  onLocation,
  onFilter,
  onHelp,
}: {
  locationLabel: string;
  filterCount: number;
  onLocation: () => void;
  onFilter: () => void;
  onHelp: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const setLang = useSession((s) => s.setLang);

  return (
    <View style={styles.bar}>
      <Pressable onPress={onLocation} style={styles.pill} hitSlop={6}>
        <View style={styles.pillLabel}>
          <Feather name="map-pin" size={14} color={color.accent} />
          <Text style={styles.pillText} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
        <Feather name="chevron-down" size={13} color={color.inkFaint} />
      </Pressable>

      <View style={styles.right}>
        <Pressable
          onPress={onHelp}
          style={styles.helpBtn}
          hitSlop={6}
          accessibilityLabel={t("a11yHelp")}
        >
          <Feather name="help-circle" size={15} color={color.ink} />
          <Text style={styles.helpText}>{t("howToUse")}</Text>
        </Pressable>

        <Pressable
          onPress={() => setLang(lang === "en" ? "th" : "en")}
          style={styles.langBtn}
          hitSlop={6}
          accessibilityLabel={t("a11yLanguage")}
        >
          <Text style={styles.langText}>{lang === "en" ? "EN" : "TH"}</Text>
        </Pressable>

        <Pressable onPress={onFilter} style={styles.filterBtn} hitSlop={6} accessibilityLabel={t("a11yFilters")}>
          <Feather name="sliders" size={19} color={color.ink} />
          {filterCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(4.5),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 150, // a little wider than "Near you" — the chevron stays pinned
    // to this edge regardless of label length, rather than trailing right
    // after the (possibly much shorter) text.
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(3.5),
    paddingVertical: space(2.25),
  },
  pillLabel: { flexDirection: "row", alignItems: "center", gap: space(1.75), flexShrink: 1 },
  pillText: { color: color.ink, fontFamily: font.bodySemi, fontSize: 14, flexShrink: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: space(2) },
  langBtn: {
    minWidth: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space(2),
  },
  langText: { fontFamily: font.bodyBold, fontSize: 13, color: color.ink },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.25),
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space(2.75),
  },
  helpText: { fontFamily: font.bodySemi, fontSize: 12.5, color: color.ink },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 11 },
});
