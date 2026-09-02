import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme/tokens";
import { CATEGORIES, RADII } from "../lib/categories";

export type Filters = { categories: string[]; radiusM: number; openNow: boolean };

export function FilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [cats, setCats] = useState<string[]>(value.categories);
  const [radiusM, setRadiusM] = useState<number>(value.radiusM);
  const [openNow, setOpenNow] = useState<boolean>(value.openNow);

  useEffect(() => {
    if (visible) {
      setCats(value.categories);
      setRadiusM(value.radiusM);
      setOpenNow(value.openNow);
    }
  }, [visible]);

  const toggle = (key: string) =>
    setCats((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  const reset = () => {
    setCats([]);
    setRadiusM(1000);
    setOpenNow(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>Filters</Text>
          <Pressable onPress={reset} hitSlop={8}>
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(3) }}>
          <Text style={styles.label}>What are you into?</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const on = cats.includes(c.key);
              return (
                <Pressable
                  key={c.key}
                  onPress={() => toggle(c.key)}
                  style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                >
                  <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>How far?</Text>
          <View style={styles.segmented}>
            {RADII.map((r) => {
              const on = radiusM === r.m;
              return (
                <Pressable key={r.m} onPress={() => setRadiusM(r.m)} style={[styles.segment, on && styles.segmentOn]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.toggleRow} onPress={() => setOpenNow((v) => !v)}>
            <Text style={styles.toggleLabel}>Open now only</Text>
            <View style={[styles.track, openNow ? styles.trackOn : styles.trackOff]}>
              <View style={[styles.knob, openNow ? styles.knobOn : styles.knobOff]} />
            </View>
          </Pressable>
        </ScrollView>

        <Pressable style={styles.apply} onPress={() => onApply({ categories: cats, radiusM, openNow })}>
          <Text style={styles.applyText}>Show restaurants</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,13,6,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    backgroundColor: color.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space(5.5),
    paddingTop: space(3.5),
    paddingBottom: space(6),
  },
  grabber: { width: 40, height: 4, borderRadius: 999, backgroundColor: "#DDD3C2", alignSelf: "center" },
  headerRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: space(4) },
  title: { fontFamily: font.display, fontSize: 23, color: color.ink, letterSpacing: -0.4 },
  reset: { fontFamily: font.bodySemi, fontSize: 14, color: color.accent },
  label: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: color.inkFaint,
    marginTop: space(6),
    marginBottom: space(3),
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2.25) },
  chip: { borderRadius: radius.pill, paddingHorizontal: space(3.5), paddingVertical: space(2.25), borderWidth: 1.5 },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  chipOff: { backgroundColor: color.surface, borderColor: color.line },
  chipText: { fontFamily: font.bodySemi, fontSize: 13.5 },
  chipTextOn: { color: color.paper },
  chipTextOff: { color: color.ink },
  segmented: { flexDirection: "row", gap: 4, backgroundColor: color.surfaceAlt, borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, alignItems: "center", paddingVertical: space(2.5), borderRadius: radius.sm },
  segmentOn: {
    backgroundColor: color.surface,
    shadowColor: "#17140F",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 2,
  },
  segmentText: { fontFamily: font.bodySemi, fontSize: 14, color: color.inkFaint },
  segmentTextOn: { color: color.ink, fontFamily: font.bodyBold },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(5.5) },
  toggleLabel: { fontFamily: font.bodySemi, fontSize: 15, color: color.ink },
  track: { width: 46, height: 28, borderRadius: 999, padding: 3 },
  trackOn: { backgroundColor: color.accent, alignItems: "flex-end" },
  trackOff: { backgroundColor: color.line, alignItems: "flex-start" },
  knob: { width: 22, height: 22, borderRadius: 999, backgroundColor: "#fff" },
  knobOn: {},
  knobOff: {},
  apply: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space(4),
  },
  applyText: { fontFamily: font.display, fontSize: 16, color: "#fff" },
});
