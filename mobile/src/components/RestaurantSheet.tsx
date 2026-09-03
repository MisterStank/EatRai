import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { getPlace, type Card, type Place } from "../api/client";
import { color, font, radius, space } from "../theme/tokens";
import { fmtCount, fmtCuisines, fmtDistance, fmtPrice, fmtRating } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";
import { isTodayLine, todayHours } from "../lib/hours";
import { openExternal } from "../lib/linking";

export function RestaurantSheet({
  visible,
  card,
  coords,
  onClose,
}: {
  visible: boolean;
  card: Card | null;
  coords?: { lat: number; lng: number } | null;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const { width } = useWindowDimensions();
  const IMG_H = Math.round(Math.min(width, 520) * 0.92);
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);

  useEffect(() => {
    if (!visible || !card) return;
    setPlace(null);
    setHoursOpen(false);
    setLoading(true);
    const ctrl = new AbortController();
    getPlace(card.id, { lang, lat: coords?.lat, lng: coords?.lng, signal: ctrl.signal })
      .then(setPlace)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [visible, card?.id, lang]);

  const view = place ?? (card as Place | null);
  const photos = useMemo(() => view?.photoUrls?.filter(Boolean) ?? [], [view]);

  const open = (url?: string) => openExternal(url);

  const hoursToday = todayHours(place?.weekdayHours, lang);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
          <Feather name="chevron-down" size={22} color={color.ink} />
        </Pressable>

        {!view ? (
          <View style={styles.center}>
            <ActivityIndicator color={color.accent} />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(10) }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ height: IMG_H }}
            >
              {(photos.length ? photos : [""]).map((uri, i) => (
                <Image key={i} source={{ uri }} style={{ width, height: IMG_H, backgroundColor: color.surfaceAlt }} resizeMode="cover" />
              ))}
            </ScrollView>

            <View style={styles.body}>
              <Text style={styles.name}>{view.name}</Text>
              <Text style={styles.meta}>
                {[fmtPrice(view.priceLevel), fmtCuisines(view.cuisines)].filter(Boolean).join("  ·  ")}
              </Text>

              <View style={styles.chips}>
                {view.rating > 0 ? (
                  <View style={styles.chip}>
                    <Feather name="star" size={12} color={color.gold} />
                    <Text style={styles.chipText}>
                      {fmtRating(view.rating)}
                      {view.ratingCount > 0 ? `  ·  ${fmtCount(view.ratingCount, lang)} ${t("reviews")}` : ""}
                    </Text>
                  </View>
                ) : null}
                {view.openKnown ? (
                  <View style={styles.chip}>
                    <View style={[styles.dot, { backgroundColor: view.openNow ? color.like : color.inkFaint }]} />
                    <Text style={[styles.chipText, { color: view.openNow ? color.like : color.inkSoft }]}>
                      {view.openNow ? t("open") : t("closed")}
                    </Text>
                  </View>
                ) : null}
                {view.distanceM > 0 ? (
                  <View style={styles.chip}>
                    <Feather name="map-pin" size={12} color={color.inkSoft} />
                    <Text style={styles.chipText}>{fmtDistance(view.distanceM, lang)}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                {place?.phone ? (
                  <Action icon="phone" label={t("call")} onPress={() => open(`tel:${place.phone.replace(/\s/g, "")}`)} />
                ) : null}
                <Action icon="navigation" label={t("directions")} onPress={() => open(view.mapsUri)} />
                {place?.website ? (
                  <Action icon="globe" label={t("website")} onPress={() => open(place.website)} />
                ) : null}
              </View>

              {place?.weekdayHours && place.weekdayHours.length > 0 ? (
                <Pressable style={styles.row} onPress={() => setHoursOpen((v) => !v)}>
                  <Feather name="clock" size={17} color={color.inkSoft} style={styles.rowIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{t("hours")}</Text>
                    <Text style={styles.rowValue}>{hoursToday || place.weekdayHours[0]}</Text>
                    {hoursOpen
                      ? place.weekdayHours.map((h, i) => (
                          <Text key={i} style={[styles.rowValue, isTodayLine(h, lang) && styles.hoursToday]}>
                            {h}
                          </Text>
                        ))
                      : null}
                  </View>
                  <Feather name={hoursOpen ? "chevron-up" : "chevron-down"} size={16} color={color.inkFaint} />
                </Pressable>
              ) : null}

              <View style={styles.row}>
                <Feather name="map-pin" size={17} color={color.inkSoft} style={styles.rowIcon} />
                <Text style={[styles.rowValue, { flex: 1 }]}>{view.address}</Text>
              </View>

              {place?.summary ? <Text style={styles.summary}>{place.summary}</Text> : null}

              {loading ? <ActivityIndicator color={color.inkFaint} style={{ marginTop: space(4) }} /> : null}

              <Pressable style={styles.mapsBtn} onPress={() => open(view.mapsUri)}>
                <Text style={styles.mapsBtnText}>{t("openInMaps")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Action({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <View style={styles.actionCircle}>
        <Feather name={icon} size={19} color={color.ink} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  close: {
    position: "absolute",
    top: space(3),
    left: space(4),
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: space(5.5) },
  name: { fontFamily: font.display, fontSize: 26, color: color.ink, letterSpacing: -0.3 },
  meta: { fontFamily: font.body, fontSize: 14, color: color.inkSoft, marginTop: space(2) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(3.5) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.75),
  },
  chipText: { fontFamily: font.bodySemi, fontSize: 12.5, color: color.ink },
  dot: { width: 7, height: 7, borderRadius: 999 },
  actions: { flexDirection: "row", gap: space(6), marginTop: space(5) },
  action: { alignItems: "center", gap: space(1.5) },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontFamily: font.bodySemi, fontSize: 12, color: color.inkSoft },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space(3),
    marginTop: space(5),
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space(4),
  },
  rowIcon: { marginTop: space(0.5) },
  rowLabel: { fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: color.inkFaint },
  rowValue: { fontFamily: font.body, fontSize: 14, color: color.ink, marginTop: space(1), lineHeight: 21 },
  hoursToday: { fontFamily: font.bodyBold, color: color.ink },
  summary: { fontFamily: font.body, fontSize: 14, color: color.inkSoft, marginTop: space(4), lineHeight: 22 },
  mapsBtn: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space(7),
  },
  mapsBtnText: { fontFamily: font.display, fontSize: 15, color: color.paper },
});
