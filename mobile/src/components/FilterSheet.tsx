import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme/tokens";
import { CATEGORIES, RADII, catLabel } from "../lib/categories";
import { fmtDistance } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession, DEFAULT_RADIUS_M, type FilterValue } from "../store/session";

export type Filters = FilterValue;

const RATINGS = [0, 3.5, 4, 4.5];
const PRICES = [1, 2, 3, 4];

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
  const t = useT();
  const lang = useSession((s) => s.lang);
  const [cats, setCats] = useState<string[]>(value.categories);
  const [radiusM, setRadiusM] = useState<number>(value.radiusM);
  const [openNow, setOpenNow] = useState<boolean>(value.openNow);
  const [minRating, setMinRating] = useState<number>(value.minRating);
  const [prices, setPrices] = useState<number[]>(value.priceLevels);
  const [sort, setSort] = useState(value.sort);

  useEffect(() => {
    if (visible) {
      setCats(value.categories);
      setRadiusM(value.radiusM);
      setOpenNow(value.openNow);
      setMinRating(value.minRating);
      setPrices(value.priceLevels);
      setSort(value.sort);
    }
  }, [visible]);

  const toggle = (key: string) =>
    setCats((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  const togglePrice = (p: number) =>
    setPrices((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort()));

  const reset = () => {
    setCats([]);
    setRadiusM(DEFAULT_RADIUS_M);
    setOpenNow(false);
    setMinRating(0);
    setPrices([]);
    setSort("near");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>{t("filters")}</Text>
          <Pressable onPress={reset} hitSlop={8}>
            <Text style={styles.reset}>{t("reset")}</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(3) }}>
          <Text style={styles.label}>{t("intoWhat")}</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const on = cats.includes(c.key);
              return (
                <Pressable
                  key={c.key}
                  onPress={() => toggle(c.key)}
                  style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                >
                  <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>
                    {catLabel(c, lang)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t("howFar")}</Text>
          <View style={styles.segmented}>
            {RADII.map((r) => {
              const on = radiusM === r.m;
              return (
                <Pressable key={r.m} onPress={() => setRadiusM(r.m)} style={[styles.segment, on && styles.segmentOn]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{fmtDistance(r.m, lang)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t("minRatingLabel")}</Text>
          <View style={styles.segmented}>
            {RATINGS.map((r) => {
              const on = minRating === r;
              return (
                <Pressable key={r} onPress={() => setMinRating(r)} style={[styles.segment, on && styles.segmentOn]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                    {r === 0 ? t("anyRating") : `★ ${r.toFixed(1)}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t("priceLabel")}</Text>
          <View style={styles.chips}>
            {PRICES.map((p) => {
              const on = prices.includes(p);
              return (
                <Pressable
                  key={p}
                  onPress={() => togglePrice(p)}
                  style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                >
                  <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>
                    {"฿".repeat(p)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t("sortLabel")}</Text>
          <View style={styles.segmented}>
            {(["near", "match"] as const).map((mode) => {
              const on = sort === mode;
              return (
                <Pressable key={mode} onPress={() => setSort(mode)} style={[styles.segment, on && styles.segmentOn]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                    {mode === "near" ? t("sortNearest") : t("sortBest")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.toggleRow} onPress={() => setOpenNow((v) => !v)}>
            <Text style={styles.toggleLabel}>{t("openNowOnly")}</Text>
            <View style={[styles.track, openNow ? styles.trackOn : styles.trackOff]}>
              <View style={styles.knob} />
            </View>
          </Pressable>
        </ScrollView>

        <Pressable
          style={styles.apply}
          onPress={() => onApply({ categories: cats, radiusM, openNow, minRating, priceLevels: prices, sort })}
        >
          <Text style={styles.applyText}>{t("showRestaurants")}</Text>
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
  title: { fontFamily: font.display, fontSize: 22, color: color.ink },
  reset: { fontFamily: font.bodySemi, fontSize: 14, color: color.accent },
  label: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    letterSpacing: 0.8,
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
  segmentText: { fontFamily: font.bodySemi, fontSize: 13.5, color: color.inkFaint },
  segmentTextOn: { color: color.ink, fontFamily: font.bodyBold },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(5.5) },
  toggleLabel: { fontFamily: font.bodySemi, fontSize: 15, color: color.ink },
  track: { width: 46, height: 28, borderRadius: 999, padding: 3 },
  trackOn: { backgroundColor: color.accent, alignItems: "flex-end" },
  trackOff: { backgroundColor: color.line, alignItems: "flex-start" },
  knob: { width: 22, height: 22, borderRadius: 999, backgroundColor: "#fff" },
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
