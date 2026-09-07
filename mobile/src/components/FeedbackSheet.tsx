import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { openExternal } from "../lib/linking";
import { FEEDBACK_FORM_URL } from "../lib/links";

// Feedback entry point: a short explainer, then a button that opens the hosted
// (Tally) feedback form in a browser. No in-app form — the whole thing lives in
// Tally so it can change without an app release.
export function FeedbackSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const t = useT();

  const open = () => {
    openExternal(FEEDBACK_FORM_URL);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t("giveFeedback")}</Text>
          <Text style={styles.body}>{t("feedbackBlurb")}</Text>
          <Pressable style={styles.primary} onPress={open} hitSlop={8}>
            <Text style={styles.primaryText}>{t("openFeedbackForm")}</Text>
          </Pressable>
          <Pressable style={styles.dismiss} onPress={onClose} hitSlop={8}>
            <Text style={styles.dismissText}>{t("gotIt")}</Text>
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
  primary: {
    alignSelf: "stretch",
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontFamily: font.display, fontSize: 15, color: "#fff" },
  dismiss: {
    alignSelf: "stretch",
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space(1),
  },
  dismissText: { fontFamily: font.bodySemi, fontSize: 14, color: color.inkSoft },
});
