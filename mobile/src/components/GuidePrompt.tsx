import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";

// One-time nudge on first launch: offers the walkthrough instead of opening it
// unannounced. Either choice is final — the caller marks the guide as seen.

export function GuidePrompt({
  visible,
  onShowMe,
  onDismiss,
}: {
  visible: boolean;
  onShowMe: () => void;
  onDismiss: () => void;
}) {
  const t = useT();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("guidePromptTitle")}</Text>
          <Text style={styles.body}>{t("guidePromptBody")}</Text>
          <Pressable style={styles.primary} onPress={onShowMe}>
            <Text style={styles.primaryText}>{t("guidePromptYes")}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onDismiss} hitSlop={8}>
            <Text style={styles.secondaryText}>{t("guidePromptLater")}</Text>
          </Pressable>
        </View>
      </View>
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
  title: { fontFamily: font.display, fontSize: 22, color: color.ink, letterSpacing: -0.4 },
  body: {
    fontFamily: font.body,
    fontSize: 14.5,
    color: color.inkSoft,
    textAlign: "center",
    lineHeight: 21,
    marginTop: space(2),
    marginBottom: space(5),
  },
  primary: {
    alignSelf: "stretch",
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontFamily: font.display, fontSize: 15, color: "#fff" },
  secondary: { paddingVertical: space(3), marginTop: space(1) },
  secondaryText: { fontFamily: font.bodySemi, fontSize: 14, color: color.inkSoft },
});
