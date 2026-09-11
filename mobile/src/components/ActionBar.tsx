import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color } from "../theme/tokens";
import { useT } from "../lib/i18n";

export function ActionBar({
  onUndo,
  onNope,
  onLike,
  onDirections,
  canUndo,
  disabled,
  variant = "restaurant",
}: {
  onUndo: () => void;
  onNope: () => void;
  onLike: () => void;
  onDirections: () => void;
  canUndo: boolean;
  disabled: boolean;
  // "ad": the top card is the in-deck ad sentinel — ✕/♡ both just advance past
  // it (dimmed to signal neither is a real choice) and the 4th slot points at
  // /support instead of directions, since there's no restaurant to navigate to.
  variant?: "restaurant" | "ad";
}) {
  const t = useT();
  const isAd = variant === "ad";
  return (
    <View style={styles.bar} pointerEvents="box-none">
      <Pressable
        onPress={onUndo}
        disabled={!canUndo}
        style={[styles.btn, styles.sm, !canUndo && styles.faded]}
        hitSlop={8}
        accessibilityLabel={t("a11yUndo")}
      >
        <Feather name="rotate-ccw" size={18} color={color.inkSoft} />
      </Pressable>

      <Pressable
        onPress={onNope}
        disabled={disabled}
        style={[styles.btn, styles.nope, (disabled || isAd) && styles.faded]}
        hitSlop={8}
        accessibilityLabel={isAd ? t("a11ySkipAd") : t("a11yPass")}
      >
        <Feather name="x" size={24} color={color.nope} />
      </Pressable>

      <Pressable
        onPress={onLike}
        disabled={disabled}
        style={[styles.btn, styles.like, (disabled || isAd) && styles.faded]}
        hitSlop={8}
        accessibilityLabel={isAd ? t("a11ySkipAd") : t("a11yLike")}
      >
        <Feather name="heart" size={26} color={color.like} />
      </Pressable>

      <Pressable
        onPress={onDirections}
        disabled={disabled}
        style={[styles.btn, styles.sm, disabled && styles.faded]}
        hitSlop={8}
        accessibilityLabel={isAd ? t("a11ySupportDev") : t("a11yDirections")}
      >
        <Feather name={isAd ? "coffee" : "navigation"} size={18} color={color.inkSoft} />
      </Pressable>
    </View>
  );
}

const shadow = {
  shadowColor: "#17140F",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.18,
  shadowRadius: 18,
  elevation: 6,
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  btn: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  sm: { width: 46, height: 46, borderRadius: 999 },
  nope: { width: 58, height: 58, borderRadius: 999 },
  like: { width: 66, height: 66, borderRadius: 999 },
  faded: { opacity: 0.4 },
});
