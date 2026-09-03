import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { getNearby, type Card } from "../api/client";
import { useSession, filterCount } from "../store/session";
import { useT } from "../lib/i18n";
import { SwipeCard, type SwipeDir } from "../components/SwipeCard";
import { ActionBar } from "../components/ActionBar";
import { TopBar } from "../components/TopBar";
import { FilterSheet, type Filters } from "../components/FilterSheet";
import { LikedSheet } from "../components/LikedSheet";
import { RestaurantSheet } from "../components/RestaurantSheet";
import { color, font, radius, space } from "../theme/tokens";

type Coords = { lat: number; lng: number };

export function DeckScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();

  const lang = useSession((s) => s.lang);
  const categories = useSession((s) => s.categories);
  const radiusM = useSession((s) => s.radiusM);
  const openNow = useSession((s) => s.openNow);
  const liked = useSession((s) => s.liked);
  const addLiked = useSession((s) => s.addLiked);
  const removeLiked = useSession((s) => s.removeLiked);
  const clearLiked = useSession((s) => s.clearLiked);
  const setFilters = useSession((s) => s.setFilters);
  const hydrated = useSession((s) => s.hydrated);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showLiked, setShowLiked] = useState(false);
  const [detail, setDetail] = useState<Card | null>(null);

  const history = useRef<{ card: Card; dir: SwipeDir }[]>([]);
  const dragX = useSharedValue(0);

  // --- location ---
  const locate = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("needLocation"));
        setLoading(false);
        return;
      }
      setLoading(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      try {
        const [g] = await Location.reverseGeocodeAsync(pos.coords);
        const label = g?.district || g?.subregion || g?.city || g?.region;
        if (label) setPlace(label);
      } catch {
        /* keep default label */
      }
    } catch {
      setError(t("locationFailed"));
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  // --- deck fetch on coords / filter change ---
  const load = useCallback(async () => {
    if (!coords || !hydrated) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getNearby(coords.lat, coords.lng, { radiusM, categories, openNow, lang });
      setCards(next);
      setIndex(0);
      history.current = [];
      if (next.length === 0) {
        setError(t("noneWithFilters"));
      }
    } catch (e: any) {
      setError(e.message ?? t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [coords, hydrated, radiusM, categories, openNow, lang, t]);

  useEffect(() => {
    load();
  }, [load]);

  const current = cards[index];

  const resolve = (dir: SwipeDir) => {
    const card = cards[index];
    if (!card) return;
    history.current.push({ card, dir });
    if (dir === "like") {
      addLiked(card);
      haptic("success");
    } else {
      haptic("light");
    }
    dragX.value = 0;
    setIndex((n) => n + 1);
  };

  const undo = () => {
    const last = history.current.pop();
    if (!last) return;
    if (last.dir === "like") removeLiked(last.card.id);
    haptic("light");
    dragX.value = 0;
    setIndex((n) => Math.max(0, n - 1));
  };

  const openDirections = () => {
    if (current) Linking.openURL(current.mapsUri).catch(() => {});
  };

  const openDetail = () => {
    if (current) setDetail(current);
  };

  const applyFilters = (f: Filters) => {
    setFilters(f);
    setShowFilters(false);
  };

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [40, 130], [0, 0.55], Extrapolation.CLAMP),
  }));
  const glowNopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [-130, -40], [0.55, 0], Extrapolation.CLAMP),
  }));

  const stack = cards.slice(index, index + 3);
  const deckDone = !loading && !error && cards.length > 0 && index >= cards.length;

  return (
    <View style={styles.root}>
      <View style={{ height: insets.top + space(2) }} />
      <TopBar
        locationLabel={place ?? t("nearYou")}
        filterCount={filterCount({ categories, openNow })}
        onLocation={locate}
        onFilter={() => setShowFilters(true)}
      />

      <View style={[styles.deck, { marginBottom: insets.bottom + space(38) }]}>
        <Animated.View pointerEvents="none" style={[styles.glow, styles.glowLike, glowStyle]}>
          <LinearGradient colors={["transparent", "rgba(18,183,106,0.4)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.glow, styles.glowNope, glowNopeStyle]}>
          <LinearGradient colors={["rgba(240,68,46,0.4)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>

        {loading ? (
          <ActivityIndicator color={color.accent} />
        ) : error ? (
          <View style={styles.message}>
            <Text style={styles.messageText}>{error}</Text>
            <Pressable style={styles.retry} onPress={load}>
              <Text style={styles.retryText}>{t("tryAgain")}</Text>
            </Pressable>
          </View>
        ) : deckDone ? (
          <View style={styles.message}>
            <Text style={styles.messageText}>{liked.length > 0 ? t("allDone") : t("allDoneNoLikes")}</Text>
            {liked.length > 0 ? (
              <Pressable style={styles.retry} onPress={() => setShowLiked(true)}>
                <Text style={styles.retryText}>{t("seeYourN", { n: liked.length })}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.linkBtn} onPress={load}>
              <Text style={styles.linkText}>{t("startOver")}</Text>
            </Pressable>
          </View>
        ) : (
          stack.map((card, i) => (
            <View key={card.id} style={[StyleSheet.absoluteFill, { zIndex: stack.length - i }]}>
              <SwipeCard card={card} depth={i} dragX={dragX} onResolve={resolve} onDetail={openDetail} />
            </View>
          ))
        )}
      </View>

      {liked.length > 0 && !deckDone ? (
        <Pressable style={[styles.likedPill, { bottom: insets.bottom + space(23) }]} onPress={() => setShowLiked(true)}>
          <Feather name="heart" size={13} color={color.like} />
          <Text style={styles.likedPillText}>{t("nLiked", { n: liked.length })}</Text>
          <Feather name="chevron-right" size={14} color={color.inkFaint} />
        </Pressable>
      ) : null}

      <View style={[styles.actions, { bottom: insets.bottom + space(4) }]}>
        <ActionBar
          onUndo={undo}
          onNope={() => resolve("nope")}
          onLike={() => resolve("like")}
          onDirections={openDirections}
          canUndo={history.current.length > 0}
          disabled={!current}
        />
      </View>

      <FilterSheet
        visible={showFilters}
        value={{ categories, radiusM, openNow }}
        onApply={applyFilters}
        onClose={() => setShowFilters(false)}
      />
      <LikedSheet
        visible={showLiked}
        liked={liked}
        onRemove={removeLiked}
        onClear={clearLiked}
        onClose={() => setShowLiked(false)}
      />
      <RestaurantSheet
        visible={!!detail}
        card={detail}
        coords={coords}
        onClose={() => setDetail(null)}
      />
    </View>
  );
}

function haptic(kind: "success" | "light") {
  if (Platform.OS === "web") return;
  if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  deck: {
    flex: 1,
    marginTop: space(3.5),
    marginHorizontal: space(4.5),
    alignItems: "center",
    justifyContent: "center",
  },
  glow: { position: "absolute", top: 0, bottom: 0, width: "60%" },
  glowLike: { right: -space(4.5) },
  glowNope: { left: -space(4.5) },
  message: { paddingHorizontal: space(6), alignItems: "center" },
  messageText: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, textAlign: "center", lineHeight: 22 },
  retry: {
    marginTop: space(4),
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.ink,
    paddingHorizontal: space(6),
    paddingVertical: space(2.5),
  },
  retryText: { fontFamily: font.displaySemi, fontSize: 14, color: color.ink },
  linkBtn: { marginTop: space(3), paddingVertical: space(1.5), paddingHorizontal: space(3) },
  linkText: { fontFamily: font.bodySemi, fontSize: 13.5, color: color.inkSoft, textDecorationLine: "underline" },
  likedPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.75),
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    shadowColor: "#17140F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  likedPillText: { fontFamily: font.bodySemi, fontSize: 13, color: color.ink },
  actions: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
