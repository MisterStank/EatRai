import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { getNearby, reverseGeocode, type Card } from "../api/client";
import { useSession, filterCount, DEFAULT_RADIUS_M } from "../store/session";
import { useT } from "../lib/i18n";
import { SwipeCard, type SwipeDir } from "../components/SwipeCard";
import { ActionBar } from "../components/ActionBar";
import { TopBar } from "../components/TopBar";
import { FilterSheet, type Filters } from "../components/FilterSheet";
import { LikedSheet } from "../components/LikedSheet";
import { HelpSheet } from "../components/HelpSheet";
import { GuidePrompt } from "../components/GuidePrompt";
import { RestaurantSheet } from "../components/RestaurantSheet";
import { MapLocationScreen } from "../components/MapLocationScreen";
import { DecideSheet } from "../components/DecideSheet";
import { openExternal } from "../lib/linking";
import { color, font, radius, space } from "../theme/tokens";

type Coords = { lat: number; lng: number };

const MAX_RADIUS_M = 50000;
const LOCATE_TIMEOUT_MS = 12000;

export function DeckScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();

  const lang = useSession((s) => s.lang);
  const categories = useSession((s) => s.categories);
  const radiusM = useSession((s) => s.radiusM);
  const openNow = useSession((s) => s.openNow);
  const minRating = useSession((s) => s.minRating);
  const priceLevels = useSession((s) => s.priceLevels);
  const sort = useSession((s) => s.sort);
  const liked = useSession((s) => s.liked);
  const addLiked = useSession((s) => s.addLiked);
  const addRecentArea = useSession((s) => s.addRecentArea);
  const removeLiked = useSession((s) => s.removeLiked);
  const clearLiked = useSession((s) => s.clearLiked);
  const setFilters = useSession((s) => s.setFilters);
  const hydrated = useSession((s) => s.hydrated);
  const hintSeen = useSession((s) => s.hintSeen);
  const markHintSeen = useSession((s) => s.markHintSeen);
  const guideSeen = useSession((s) => s.guideSeen);
  const markGuideSeen = useSession((s) => s.markGuideSeen);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [manualLocation, setManualLocation] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widenM, setWidenM] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showLiked, setShowLiked] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showDecide, setShowDecide] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showGuidePrompt, setShowGuidePrompt] = useState(false);
  const [detail, setDetail] = useState<Card | null>(null);

  const history = useRef<{ card: Card; dir: SwipeDir }[]>([]);
  const excluded = useRef<Set<string>>(new Set());
  const loadCtrl = useRef<AbortController | null>(null);
  const dragX = useSharedValue(0);

  const effectiveRadius = widenM ?? radiusM;

  // --- location ---
  const locate = useCallback(async () => {
    setManualLocation(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("needLocation"));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), LOCATE_TIMEOUT_MS),
        ),
      ]);
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(here);
      try {
        const { label } = await reverseGeocode(here.lat, here.lng, { lang });
        if (label) {
          setPlace(label);
        } else {
          const [g] = await Location.reverseGeocodeAsync(pos.coords);
          setPlace(g?.district || g?.subregion || g?.city || g?.region || null);
        }
      } catch {
        setPlace(null);
      }
    } catch (e: any) {
      setError(e?.message === "timeout" ? t("locationTimedOut") : t("locationFailed"));
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const pickLocation = (c: Coords, label: string) => {
    setShowLocation(false);
    setManualLocation(true);
    setError(null);
    setPlace(label);
    if (label && label !== t("pinnedHere")) addRecentArea({ lat: c.lat, lng: c.lng, label });
    excluded.current.clear();
    setWidenM(null);
    setCoords(c);
  };

  // --- deck fetch on coords / filter change ---
  const load = useCallback(async () => {
    if (!coords || !hydrated) return;
    loadCtrl.current?.abort();
    const ctrl = new AbortController();
    loadCtrl.current = ctrl;

    setLoading(true);
    setError(null);
    const keepId = cards[index]?.id;
    try {
      const next = await getNearby(coords.lat, coords.lng, {
        radiusM: effectiveRadius,
        categories,
        openNow,
        minRating,
        priceLevels,
        sort,
        lang,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      // Read the current liked ids live (not via a subscribed selector) so a
      // like doesn't recreate `load` and force a refetch — but an already-
      // liked place should never reappear in the swipeable deck, even after
      // a filter/location change or a widened search clears `excluded`.
      const likedIds = useSession.getState().liked;
      const deck = next.filter(
        (c) => !excluded.current.has(c.id) && !likedIds.some((l) => l.id === c.id),
      );
      const keepAt = keepId ? deck.findIndex((c) => c.id === keepId) : -1;
      setCards(deck);
      // Swipe history is positional (undo = "go back one index"), so it only
      // makes sense against the deck it was built from. Any reload — filter
      // change, new location — invalidates it, even when the current card
      // happens to still be present at a different index in the new deck.
      history.current = [];
      setIndex(keepAt >= 0 ? keepAt : 0);
      if (deck.length === 0) setError(t("noneWithFilters"));
      else if (!guideSeen) setShowGuidePrompt(true);
      else if (!hintSeen) setShowHint(true);
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === "AbortError") return;
      setError(e?.message === "TOO_MANY" ? t("tooMany") : e.message ?? t("loadFailed"));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
    // lang/t are deliberately excluded: switching display language shouldn't
    // reset the deck the user is mid-swipe through. The card data (e.g.
    // cuisine labels) just keeps whatever language was active at the last
    // real reload (filter/location/widen) until the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, hydrated, effectiveRadius, categories, openNow, minRating, priceLevels, sort]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => loadCtrl.current?.abort(), []);

  const current = cards[index];

  const resolve = useCallback(
    (dir: SwipeDir) => {
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
    },
    [cards, index, addLiked, dragX],
  );

  const undo = useCallback(() => {
    const last = history.current.pop();
    if (!last) return;
    if (last.dir === "like") removeLiked(last.card.id);
    haptic("light");
    dragX.value = 0;
    setIndex((n) => Math.max(0, n - 1));
  }, [removeLiked, dragX]);

  const openDirections = () => {
    if (current) openExternal(current.mapsUri);
  };

  const openDetail = () => {
    if (current) setDetail(current);
  };

  const dismissHint = () => {
    setShowHint(false);
    markHintSeen();
  };

  const acceptGuide = () => {
    markGuideSeen();
    setShowGuidePrompt(false);
    setShowHelp(true);
  };

  const dismissGuidePrompt = () => {
    markGuideSeen();
    setShowGuidePrompt(false);
  };

  const widenSearch = () => {
    excluded.current = new Set(cards.map((c) => c.id));
    setWidenM((prev) => {
      const from = prev ?? radiusM;
      return from >= MAX_RADIUS_M ? MAX_RADIUS_M : Math.min(MAX_RADIUS_M, from * 2);
    });
  };

  const applyFilters = (f: Filters) => {
    excluded.current.clear();
    setWidenM(null);
    setFilters(f);
    setShowFilters(false);
  };

  // --- keyboard shortcuts on web ---
  const kbd = useRef({ resolve, undo, openDetail: () => current && setDetail(current) });
  kbd.current = { resolve, undo, openDetail: () => current && setDetail(current) };
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const anyModal =
      showFilters ||
      showLiked ||
      showLocation ||
      showDecide ||
      !!detail ||
      showHint ||
      showHelp ||
      showGuidePrompt;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !anyModal) {
        setShowHelp(true);
        return;
      }
      if (anyModal) return;
      if (e.key === "ArrowLeft") kbd.current.resolve("nope");
      else if (e.key === "ArrowRight") kbd.current.resolve("like");
      else if (e.key === "ArrowUp") kbd.current.openDetail();
      else if (e.key.toLowerCase() === "z") kbd.current.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFilters, showLiked, showLocation, showDecide, detail, showHint, showHelp, showGuidePrompt]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [40, 130], [0, 0.55], Extrapolation.CLAMP),
  }));
  const glowNopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [-130, -40], [0.55, 0], Extrapolation.CLAMP),
  }));

  const stack = cards.slice(index, index + 3);
  const deckDone = !loading && !error && cards.length > 0 && index >= cards.length;
  const canWiden = effectiveRadius < MAX_RADIUS_M;

  return (
    <View style={styles.root}>
      <View style={styles.frame}>
        <View style={{ height: insets.top + space(2) }} />
        <TopBar
          locationLabel={place ?? t("nearYou")}
          filterCount={filterCount({ categories, openNow, radiusM, minRating, priceLevels, sort })}
          onLocation={() => setShowLocation(true)}
          onFilter={() => setShowFilters(true)}
          onHelp={() => setShowHelp(true)}
        />

        <View style={[styles.deck, { marginBottom: insets.bottom + space(38) }]}>
          <Animated.View pointerEvents="none" style={[styles.glow, styles.glowLike, glowStyle]}>
            <LinearGradient colors={["transparent", "rgba(18,183,106,0.4)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.glow, styles.glowNope, glowNopeStyle]}>
            <LinearGradient colors={["rgba(240,68,46,0.4)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>

          {loading ? (
            <SkeletonCard />
          ) : error ? (
            <View style={styles.message}>
              <Text style={styles.messageText}>{error}</Text>
              <View style={styles.messageActions}>
                <Pressable style={styles.retry} onPress={load}>
                  <Text style={styles.retryText}>{t("tryAgain")}</Text>
                </Pressable>
                <Pressable style={styles.linkBtn} onPress={() => setShowLocation(true)}>
                  <Text style={styles.linkText}>{t("changeLocation")}</Text>
                </Pressable>
              </View>
            </View>
          ) : deckDone ? (
            <View style={styles.message}>
              <Text style={styles.messageText}>{liked.length > 0 ? t("allDone") : t("allDoneNoLikes")}</Text>
              {liked.length > 0 ? (
                <Pressable style={[styles.retry, styles.retrySpaced]} onPress={() => setShowDecide(true)}>
                  <Text style={styles.retryText}>{t("decideFromSaved", { n: liked.length })}</Text>
                </Pressable>
              ) : null}
              <View style={styles.messageActions}>
                {liked.length > 0 ? (
                  <Pressable style={styles.linkBtn} onPress={() => setShowLiked(true)}>
                    <Text style={styles.linkText}>{t("seeYourN", { n: liked.length })}</Text>
                  </Pressable>
                ) : null}
                {canWiden ? (
                  <Pressable style={styles.linkBtn} onPress={widenSearch}>
                    <Text style={styles.linkText}>{t("startOver")}</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.linkBtn} onPress={() => setShowLocation(true)}>
                  <Text style={styles.linkText}>{t("changeLocation")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            stack.map((card, i) => (
              <View key={card.id} style={[StyleSheet.absoluteFill, { zIndex: stack.length - i }]}>
                <SwipeCard card={card} depth={i} dragX={dragX} onResolve={resolve} onDetail={openDetail} />
              </View>
            ))
          )}

          {showHint && !loading && !error && !deckDone ? (
            <Pressable style={styles.hint} onPress={dismissHint}>
              <Text style={styles.hintText}>{t("swipeHint")}</Text>
              <Text style={styles.hintDismiss}>{t("gotIt")}</Text>
            </Pressable>
          ) : null}
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
      </View>

      <FilterSheet
        visible={showFilters}
        value={{ categories, radiusM, openNow, minRating, priceLevels, sort }}
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
      <HelpSheet visible={showHelp} onClose={() => setShowHelp(false)} />
      <GuidePrompt
        visible={showGuidePrompt}
        onShowMe={acceptGuide}
        onDismiss={dismissGuidePrompt}
      />
      <MapLocationScreen
        visible={showLocation}
        initial={coords}
        onClose={() => setShowLocation(false)}
        onConfirm={pickLocation}
        onUseMyLocation={locate}
      />
      <DecideSheet
        visible={showDecide}
        candidates={liked}
        fromLikes
        onClose={() => setShowDecide(false)}
        onOpenDetail={(c) => {
          setShowDecide(false);
          setDetail(c);
        }}
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

function SkeletonCard() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonInfo}>
        <View style={[styles.skelBar, { width: "62%", height: 22 }]} />
        <View style={[styles.skelBar, { width: "40%", height: 13, marginTop: 12 }]} />
        <View style={styles.skelChips}>
          <View style={styles.skelChip} />
          <View style={styles.skelChip} />
        </View>
      </View>
    </View>
  );
}

function haptic(kind: "success" | "light") {
  if (Platform.OS === "web") return;
  if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper, alignItems: "center" },
  frame: { flex: 1, width: "100%", maxWidth: 480 },
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
  messageActions: { alignItems: "center", marginTop: space(4), gap: space(2.5) },
  retry: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.ink,
    paddingHorizontal: space(6),
    paddingVertical: space(2.5),
  },
  retrySpaced: { marginTop: space(4) },
  retryText: { fontFamily: font.displaySemi, fontSize: 14, color: color.ink },
  linkBtn: { paddingVertical: space(1.5), paddingHorizontal: space(3) },
  linkText: { fontFamily: font.bodySemi, fontSize: 13.5, color: color.inkSoft, textDecorationLine: "underline" },
  hint: {
    position: "absolute",
    left: space(4),
    right: space(4),
    bottom: space(4),
    backgroundColor: "rgba(23,20,15,0.92)",
    borderRadius: radius.lg,
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
    alignItems: "center",
    gap: space(2),
  },
  hintText: { fontFamily: font.body, fontSize: 13, color: "#fff", textAlign: "center", lineHeight: 19 },
  hintDismiss: { fontFamily: font.bodyBold, fontSize: 12, color: color.gold, letterSpacing: 0.5 },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.card,
    backgroundColor: color.surfaceAlt,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  skeletonInfo: { padding: space(5.5) },
  skelBar: { backgroundColor: "rgba(23,20,15,0.09)", borderRadius: 6 },
  skelChips: { flexDirection: "row", gap: space(2), marginTop: space(3.5) },
  skelChip: { width: 64, height: 26, borderRadius: 999, backgroundColor: "rgba(23,20,15,0.09)" },
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
