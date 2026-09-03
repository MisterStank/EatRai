import React, { useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  Extrapolation,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { fmtCuisines, fmtDistance, fmtPrice, fmtRating } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";
import type { Card } from "../api/client";

export type SwipeDir = "like" | "nope";

export function SwipeCard({
  card,
  depth,
  dragX,
  onResolve,
  onDetail,
}: {
  card: Card;
  depth: number; // 0 = top / interactive
  dragX?: SharedValue<number>;
  onResolve: (dir: SwipeDir) => void;
  onDetail: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const threshold = width * 0.28;
  const isTop = depth === 0;
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const photos = card.photoUrls?.length ? card.photoUrls : [""];
  const [pi, setPi] = useState(0);
  const [cardH, setCardH] = useState(0);
  const idx = Math.min(pi, photos.length - 1);
  const multi = photos.length > 1;

  const step = (dir: 1 | -1) => setPi((n) => (n + dir + photos.length) % photos.length);

  const tap = Gesture.Tap()
    .enabled(isTop)
    .maxDistance(10)
    .onEnd((e, success) => {
      if (!success) return;
      if (cardH > 0 && e.y > cardH * 0.72) {
        runOnJS(onDetail)();
      } else if (multi) {
        runOnJS(step)(e.x < width * 0.5 ? -1 : 1);
      } else {
        runOnJS(onDetail)();
      }
    });

  const pan = Gesture.Pan()
    .enabled(isTop)
    .onChange((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      if (dragX) dragX.value = e.translationX;
    })
    .onEnd(() => {
      if (x.value > threshold) {
        x.value = withSpring(width * 1.6, { damping: 18 });
        runOnJS(onResolve)("like");
      } else if (x.value < -threshold) {
        x.value = withSpring(-width * 1.6, { damping: 18 });
        runOnJS(onResolve)("nope");
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
        if (dragX) dragX.value = withSpring(0);
      }
    });

  const animStyle = useAnimatedStyle(() => {
    if (!isTop) {
      if (reduceMotion) return { transform: [{ translateY: depth * 14 }] };
      return { transform: [{ scale: 1 - depth * 0.05 }, { translateY: depth * 14 }] };
    }
    return {
      transform: [
        { translateX: x.value },
        { translateY: y.value * 0.32 },
        { rotate: reduceMotion ? "0deg" : `${interpolate(x.value, [-width, width], [-9, 9])}deg` },
      ],
    };
  });

  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [40, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const nopeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-threshold, -40], [1, 0], Extrapolation.CLAMP),
  }));

  const body = (
    <Animated.View
      style={[styles.card, animStyle]}
      onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
      accessible={isTop}
      accessibilityLabel={isTop ? t("a11yRestaurantCard", { name: card.name }) : undefined}
    >
      <LinearGradient
        colors={["#F4AE63", "#E7743A", "#BE4127"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {(isTop ? photos[idx] : photos[0]) ? (
        <Image
          source={{ uri: isTop ? photos[idx] : photos[0] }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}

      {isTop && multi ? (
        <View style={styles.segments}>
          {photos.map((_, i) => (
            <View key={i} style={[styles.segment, i === idx && styles.segmentOn]} />
          ))}
        </View>
      ) : null}

      {isTop && multi ? (
        <>
          <View style={[styles.navHint, styles.navLeft]} pointerEvents="none">
            <Feather name="chevron-left" size={20} color="rgba(255,255,255,0.9)" />
          </View>
          <View style={[styles.navHint, styles.navRight]} pointerEvents="none">
            <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.9)" />
          </View>
        </>
      ) : null}

      <LinearGradient
        colors={["transparent", "rgba(20,14,7,0.35)", "rgba(20,14,7,0.9)"]}
        locations={[0, 0.45, 1]}
        style={styles.scrim}
      />

      {isTop ? (
        <>
          <Animated.View style={[styles.stamp, styles.stampLike, likeStamp]}>
            <Text style={styles.stampLikeText}>{t("yourTaste")}</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampNope, nopeStamp]}>
            <Text style={styles.stampNopeText}>{t("pass")}</Text>
          </Animated.View>
        </>
      ) : null}

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {card.name}
          </Text>
          {isTop ? <Feather name="chevron-up" size={18} color="rgba(255,255,255,0.7)" /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[fmtPrice(card.priceLevel), fmtCuisines(card.cuisines)].filter(Boolean).join("  ·  ")}
        </Text>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{fmtDistance(card.distanceM, lang)}</Text>
          </View>
          {card.rating > 0 ? (
            <View style={styles.chip}>
              <Feather name="star" size={11} color={color.gold} />
              <Text style={styles.chipText}>{fmtRating(card.rating)}</Text>
            </View>
          ) : null}
          {card.openKnown ? (
            <View style={styles.chip}>
              <View style={[styles.dot, { backgroundColor: card.openNow ? color.likeBright : color.gold }]} />
              <Text style={styles.chipText}>{card.openNow ? t("open") : t("closed")}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );

  if (!isTop) return body;
  return <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>{body}</GestureDetector>;
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.card,
    backgroundColor: color.surfaceAlt,
    overflow: "hidden",
  },
  segments: {
    position: "absolute",
    top: space(2.5),
    left: space(3),
    right: space(3),
    flexDirection: "row",
    gap: space(1.25),
  },
  segment: { flex: 1, height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.32)" },
  segmentOn: { backgroundColor: "rgba(255,255,255,0.95)" },
  navHint: {
    position: "absolute",
    top: "42%",
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  navLeft: { left: space(2.5) },
  navRight: { right: space(2.5) },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "64%" },
  info: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space(5.5) },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  name: {
    color: color.onPhoto,
    fontFamily: font.display,
    fontSize: 26,
    letterSpacing: -0.3,
    flexShrink: 1,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  meta: { color: "rgba(255,255,255,0.87)", fontFamily: font.body, fontSize: 13.5, marginTop: space(2.25) },
  chips: { flexDirection: "row", gap: space(2), marginTop: space(3.5) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.25),
    backgroundColor: "rgba(0,0,0,0.32)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: radius.pill,
    paddingHorizontal: space(2.75),
    paddingVertical: space(1.5),
  },
  chipText: { color: color.onPhoto, fontFamily: font.bodySemi, fontSize: 12.5 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  stamp: {
    position: "absolute",
    top: space(7),
    borderWidth: 3,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(1.5),
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  stampLike: { left: space(6), transform: [{ rotate: "-12deg" }], borderColor: color.likeBright },
  stampNope: { right: space(6), transform: [{ rotate: "12deg" }], borderColor: color.nope },
  stampLikeText: { color: color.likeBright, fontFamily: font.display, fontSize: 28, letterSpacing: 2 },
  stampNopeText: { color: color.nope, fontFamily: font.display, fontSize: 28, letterSpacing: 2 },
});
