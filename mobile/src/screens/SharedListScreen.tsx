import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { getPlace, type Place } from "../api/client";
import { RestaurantSheet } from "../components/RestaurantSheet";
import { color, font, radius, space } from "../theme/tokens";
import { fmtCuisines, fmtPrice, fmtRating } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";

export function SharedListScreen({ ids }: { ids: string[] }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const lang = useSession((s) => s.lang);
  const hydrated = useSession((s) => s.hydrated);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Place | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    setLoading(true);
    Promise.all(ids.slice(0, 25).map((id) => getPlace(id, { lang }).catch(() => null))).then((res) => {
      if (!alive) return;
      setPlaces(res.filter(Boolean) as Place[]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [hydrated, lang]);

  const goHome = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.location.href = "/";
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space(4) }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>กินไร?</Text>
        <Text style={styles.kicker}>{t("sharedWithYou")}</Text>
        <Text style={styles.count}>{t("nPlaces", { n: loading ? ids.length : places.length })}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={color.accent} />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: space(28) }} showsVerticalScrollIndicator={false}>
          {places.map((p) => (
            <Pressable key={p.id} style={styles.row} onPress={() => setDetail(p)}>
              {p.photoUrls?.[0] ? (
                <Image source={{ uri: p.photoUrls[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: color.accent }]} />
              )}
              <View style={styles.rowMid}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {[fmtPrice(p.priceLevel), fmtCuisines(p.cuisines)].filter(Boolean).join(" · ")}
                </Text>
                {p.rating > 0 || p.openKnown ? (
                  <Text style={[styles.rowMeta, { color: p.openNow ? color.like : color.inkFaint }]} numberOfLines={1}>
                    {[p.rating > 0 ? `★ ${fmtRating(p.rating)}` : "", p.openKnown ? (p.openNow ? t("open") : t("closed")) : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ) : null}
              </View>
              <Feather name="chevron-right" size={20} color={color.inkFaint} />
            </Pressable>
          ))}
          {places.length === 0 ? <Text style={styles.empty}>—</Text> : null}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + space(5) }]}>
        <Pressable style={styles.cta} onPress={goHome}>
          <Text style={styles.ctaText}>{t("openEatRai")}</Text>
        </Pressable>
      </View>

      <RestaurantSheet visible={!!detail} card={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  header: { paddingHorizontal: space(5.5), marginBottom: space(3) },
  logo: { fontFamily: font.display, fontSize: 22, color: color.accent, letterSpacing: -0.3 },
  kicker: { fontFamily: font.bodySemi, fontSize: 14, color: color.inkSoft, marginTop: space(3) },
  count: { fontFamily: font.display, fontSize: 30, color: color.ink, letterSpacing: -0.6, marginTop: space(0.5) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flex: 1, paddingHorizontal: space(4.5), marginTop: space(2) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3.5),
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space(3),
    marginBottom: space(3),
  },
  thumb: { width: 60, height: 60, borderRadius: radius.md },
  rowMid: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.displaySemi, fontSize: 16, color: color.ink },
  rowSub: { fontFamily: font.body, fontSize: 13, color: color.inkSoft, marginTop: space(0.75) },
  rowMeta: { fontFamily: font.bodySemi, fontSize: 12, marginTop: space(0.75) },
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkSoft, textAlign: "center", marginTop: space(10) },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space(4.5),
    paddingTop: space(4),
    backgroundColor: color.paper,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  cta: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontFamily: font.display, fontSize: 16, color: "#fff" },
});
