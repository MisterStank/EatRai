import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";

export function TopBar({
  locationLabel,
  filterCount,
  onLocation,
  onFilter,
}: {
  locationLabel: string;
  filterCount: number;
  onLocation: () => void;
  onFilter: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onLocation} style={styles.pill} hitSlop={6}>
        <Feather name="map-pin" size={14} color={color.accent} />
        <Text style={styles.pillText} numberOfLines={1}>
          {locationLabel}
        </Text>
        <Feather name="chevron-down" size={13} color={color.inkFaint} />
      </Pressable>

      <Pressable onPress={onFilter} style={styles.filterBtn} hitSlop={6} accessibilityLabel="Filters">
        <Feather name="sliders" size={19} color={color.ink} />
        {filterCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{filterCount}</Text>
          </View>
        ) : null}
      </Pressable>
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
    gap: space(1.75),
    maxWidth: 220,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(3.5),
    paddingVertical: space(2.25),
  },
  pillText: { color: color.ink, fontFamily: font.bodySemi, fontSize: 14, flexShrink: 1 },
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
