import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { useT, type TKey } from "../lib/i18n";

const ROWS: { icon: keyof typeof Feather.glyphMap; title: TKey; body: TKey }[] = [
  { icon: "chevrons-right", title: "helpSwipeTitle", body: "helpSwipeBody" },
  { icon: "image", title: "helpMoreTitle", body: "helpMoreBody" },
  { icon: "rotate-ccw", title: "helpUndoTitle", body: "helpUndoBody" },
  { icon: "map-pin", title: "helpAreaTitle", body: "helpAreaBody" },
  { icon: "sliders", title: "helpFiltersTitle", body: "helpFiltersBody" },
  { icon: "zap", title: "helpDecideTitle", body: "helpDecideBody" },
  { icon: "heart", title: "helpListTitle", body: "helpListBody" },
];

export function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
          <Feather name="x" size={18} color={color.ink} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.kicker}>{t("helpTitle")}</Text>
          <Text style={styles.sub}>{t("helpIntro")}</Text>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: space(4) }}
          showsVerticalScrollIndicator={false}
        >
          {ROWS.map((r) => (
            <View key={r.title} style={styles.row}>
              <View style={styles.iconWrap}>
                <Feather name={r.icon} size={17} color={color.accent} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle}>{t(r.title)}</Text>
                <Text style={styles.rowBody}>{t(r.body)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.gotItBtn} onPress={onClose}>
            <Text style={styles.gotItText}>{t("gotIt")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper, paddingTop: space(14) },
  close: {
    position: "absolute",
    top: space(4),
    left: space(4.5),
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  header: { paddingHorizontal: space(5.5), marginBottom: space(4) },
  kicker: { fontFamily: font.display, fontSize: 32, color: color.ink, letterSpacing: -0.6 },
  sub: { fontFamily: font.body, fontSize: 14, color: color.inkSoft, marginTop: space(2) },
  list: { flex: 1, paddingHorizontal: space(4.5) },
  row: {
    flexDirection: "row",
    gap: space(3.5),
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space(3.5),
    marginBottom: space(3),
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: color.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: font.displaySemi, fontSize: 15.5, color: color.ink },
  rowBody: { fontFamily: font.body, fontSize: 13.5, color: color.inkSoft, marginTop: space(1), lineHeight: 19 },
  footer: {
    paddingHorizontal: space(4.5),
    paddingTop: space(4),
    paddingBottom: space(5),
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  gotItBtn: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  gotItText: { fontFamily: font.display, fontSize: 16, color: "#fff" },
});
