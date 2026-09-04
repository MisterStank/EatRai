import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { color, font, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { LocationForm } from "./LocationForm";

// Native picker: no interactive map (that lives in the .web.tsx build). A
// full-screen search form instead.
export function MapLocationScreen({
  visible,
  initial,
  onClose,
  onConfirm,
  onUseMyLocation,
}: {
  visible: boolean;
  initial?: { lat: number; lng: number } | null;
  onClose: () => void;
  onConfirm: (coords: { lat: number; lng: number }, label: string) => void;
  onUseMyLocation: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + space(3) }]}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={color.ink} />
          </Pressable>
          <Text style={styles.title}>{t("changeLocation")}</Text>
        </View>
        <View style={styles.body}>
          <LocationForm
            center={initial}
            onPick={(c, label) => {
              onConfirm(c, label);
              onClose();
            }}
            onUseMyLocation={() => {
              onUseMyLocation();
              onClose();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper, paddingHorizontal: space(5.5) },
  header: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(5) },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: font.display, fontSize: 22, color: color.ink },
  body: { flex: 1 },
});
