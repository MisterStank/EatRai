import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { AreaSearch } from "./AreaSearch";

// LocationForm is the map-free way to pick a search area — autocomplete plus
// "use my location". The native picker and the web map's load-failure fallback.
export function LocationForm({
  onPick,
  onUseMyLocation,
  center,
}: {
  onPick: (coords: { lat: number; lng: number }, label: string) => void;
  onUseMyLocation: () => void;
  center?: { lat: number; lng: number } | null;
}) {
  const t = useT();
  return (
    <View>
      <AreaSearch onPick={onPick} center={center} autoFocus />
      <Pressable style={styles.secondary} onPress={onUseMyLocation}>
        <Feather name="navigation" size={15} color={color.ink} />
        <Text style={styles.secondaryText}>{t("useMyLocation")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  secondary: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    marginTop: space(4),
  },
  secondaryText: { fontFamily: font.displaySemi, fontSize: 14.5, color: color.ink },
});
