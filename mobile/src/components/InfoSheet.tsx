import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";

// A minimal placeholder sheet: a heading naming the feature and a "coming soon"
// line. Used for menu items whose real screens aren't built yet.
export function InfoSheet({
  visible,
  title,
  onClose,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{t("comingSoon")}</Text>
          <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>{t("gotIt")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(23,20,15,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: space(7),
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: color.paper,
    borderRadius: radius.card,
    padding: space(6),
    alignItems: "center",
  },
  title: {
    fontFamily: font.display,
    fontSize: 20,
    color: color.ink,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  body: {
    fontFamily: font.body,
    fontSize: 14.5,
    color: color.inkSoft,
    textAlign: "center",
    marginTop: space(2),
    marginBottom: space(5),
  },
  close: {
    alignSelf: "stretch",
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { fontFamily: font.display, fontSize: 15, color: "#fff" },
});
