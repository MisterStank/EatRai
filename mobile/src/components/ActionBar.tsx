import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color } from "../theme/tokens";

export function ActionBar({
  onUndo,
  onNope,
  onLike,
  onDirections,
  canUndo,
  disabled,
}: {
  onUndo: () => void;
  onNope: () => void;
  onLike: () => void;
  onDirections: () => void;
  canUndo: boolean;
  disabled: boolean;
}) {
  return (
    <View style={styles.bar} pointerEvents="box-none">
      <Pressable
        onPress={onUndo}
        disabled={!canUndo}
        style={[styles.btn, styles.sm, !canUndo && styles.faded]}
        hitSlop={8}
        accessibilityLabel="Undo"
      >
        <Feather name="rotate-ccw" size={19} color={color.inkSoft} />
      </Pressable>

      <Pressable onPress={onNope} disabled={disabled} style={[styles.btn, styles.nope, disabled && styles.faded]} hitSlop={8} accessibilityLabel="Pass">
        <Feather name="x" size={26} color={color.nope} />
      </Pressable>

      <Pressable onPress={onLike} disabled={disabled} style={[styles.btn, styles.like, disabled && styles.faded]} hitSlop={8} accessibilityLabel="Like">
        <Feather name="heart" size={28} color={color.like} />
      </Pressable>

      <Pressable onPress={onDirections} disabled={disabled} style={[styles.btn, styles.sm, disabled && styles.faded]} hitSlop={8} accessibilityLabel="Directions">
        <Feather name="navigation" size={19} color={color.inkSoft} />
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
    gap: 20,
  },
  btn: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  sm: { width: 48, height: 48, borderRadius: 999 },
  nope: { width: 62, height: 62, borderRadius: 999 },
  like: { width: 72, height: 72, borderRadius: 999 },
  faded: { opacity: 0.4 },
});
