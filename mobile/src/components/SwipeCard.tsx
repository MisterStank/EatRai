import React from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  Extrapolation,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { fmtCuisines, fmtDistance, fmtPrice, fmtRating } from "../lib/format";
import type { Card } from "../api/client";

export type SwipeDir = "like" | "nope";

const { width } = Dimensions.get("window");
const THRESHOLD = width * 0.28;

export function SwipeCard({
  card,
  depth,
  dragX,
  onResolve,
  onOpen,
}: {
  card: Card;
  depth: number; // 0 = top / interactive
  dragX?: SharedValue<number>;
  onResolve: (dir: SwipeDir) => void;
  onOpen: () => void;
}) {
  const isTop = depth === 0;
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const tap = Gesture.Tap()
    .enabled(isTop)
    .maxDistance(10)
    .onEnd((_e, success) => {
      if (success) runOnJS(onOpen)();
    });

  const pan = Gesture.Pan()
    .enabled(isTop)
    .onChange((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      if (dragX) dragX.value = e.translationX;
    })
    .onEnd(() => {
      if (x.value > THRESHOLD) {
        x.value = withSpring(width * 1.6, { damping: 18 });
        runOnJS(onResolve)("like");
      } else if (x.value < -THRESHOLD) {
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
      return { transform: [{ scale: 1 - depth * 0.05 }, { translateY: depth * 14 }] };
    }
    return {
      transform: [
        { translateX: x.value },
        { translateY: y.value * 0.32 },
        { rotate: `${interpolate(x.value, [-width, width], [-9, 9])}deg` },
      ],
    };
  });

  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [40, THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const nopeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-THRESHOLD, -40], [1, 0], Extrapolation.CLAMP),
  }));

  const body = (
    <Animated.View style={[styles.card, animStyle]}>
      <LinearGradient
        colors={["#F4AE63", "#E7743A", "#BE4127"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {card.photoUrls?.[0] ? (
        <Image source={{ uri: card.photoUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      <LinearGradient
        colors={["transparent", "rgba(20,14,7,0.35)", "rgba(20,14,7,0.9)"]}
        locations={[0, 0.45, 1]}
        style={styles.scrim}
      />

      {isTop ? (
        <>
          <Animated.View style={[styles.stamp, styles.stampLike, likeStamp]}>
            <Text style={styles.stampLikeText}>LIKE</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampNope, nopeStamp]}>
            <Text style={styles.stampNopeText}>NOPE</Text>
          </Animated.View>
        </>
      ) : null}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[fmtPrice(card.priceLevel), fmtCuisines(card.cuisines)].filter(Boolean).join("  ·  ")}
        </Text>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{fmtDistance(card.distanceM)}</Text>
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
              <Text style={styles.chipText}>{card.openNow ? "Open now" : "Closed"}</Text>
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
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "64%" },
  info: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space(5.5) },
  name: { color: color.onPhoto, fontFamily: font.display, fontSize: 27, letterSpacing: -0.5 },
  meta: { color: "rgba(255,255,255,0.87)", fontFamily: font.body, fontSize: 13.5, marginTop: space(2.25) },
  chips: { flexDirection: "row", gap: space(2), marginTop: space(3.5) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.25),
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
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
  stampLikeText: { color: color.likeBright, fontFamily: font.display, fontSize: 30, letterSpacing: 3 },
  stampNopeText: { color: color.nope, fontFamily: font.display, fontSize: 30, letterSpacing: 3 },
});
