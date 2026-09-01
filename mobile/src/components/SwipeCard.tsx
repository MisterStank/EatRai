import React from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { color, font, radius, space } from "../theme/tokens";
import type { Card, Direction } from "../api/client";

const { width } = Dimensions.get("window");
const THRESHOLD = width * 0.26;

export function SwipeCard({
  card,
  isTop,
  onResolve,
}: {
  card: Card;
  isTop: boolean;
  onResolve: (dir: Direction) => void;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const pan = Gesture.Pan()
    .onChange((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
    })
    .onEnd(() => {
      if (x.value > THRESHOLD) {
        x.value = withSpring(width * 1.5);
        runOnJS(onResolve)(1);
      } else if (x.value < -THRESHOLD) {
        x.value = withSpring(-width * 1.5);
        runOnJS(onResolve)(-1);
      } else if (y.value < -THRESHOLD) {
        y.value = withSpring(-width * 1.5);
        runOnJS(onResolve)(2);
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${interpolate(x.value, [-width, width], [-11, 11])}deg` },
    ],
  }));
  const likeOp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, THRESHOLD], [0, 1]) }));
  const passOp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-THRESHOLD, 0], [1, 0]) }));
  const superOp = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [-THRESHOLD, 0], [1, 0]) }));

  const body = (
    <Animated.View style={[styles.card, card.isStretch && styles.stretchCard, isTop && cardStyle]}>
      <Image source={{ uri: card.photoUrls[0] }} style={styles.photo} />

      <Animated.View style={[styles.stamp, styles.like, likeOp]}>
        <Text style={styles.stampText}>KIN!</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.pass, passOp]}>
        <Text style={styles.stampText}>NOPE</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.superLike, superOp]}>
        <Text style={styles.stampText}>★ MUST</Text>
      </Animated.View>

      {card.isStretch && (
        <View style={styles.stretchBadge}>
          <Text style={styles.stretchBadgeText}>STRETCH PICK · outside your usual</Text>
        </View>
      )}

      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={styles.sub}>
          {"$".repeat(Math.max(1, card.priceLevel))} · {card.cuisines.slice(0, 2).join(", ") || "Restaurant"} ·{" "}
          {fmtDist(card.distanceM)}
        </Text>

        {!card.isStretch && card.matchScore > 0 && (
          <Text style={styles.match}>
            {Math.round(card.matchScore)}% your taste
          </Text>
        )}

        {card.reasons && card.reasons.length > 0 && (
          <View style={styles.reasonRow}>
            {card.reasons.slice(0, 3).map((rsn) => (
              <View key={rsn} style={styles.chip}>
                <Text style={styles.chipText}>{rsn}</Text>
              </View>
            ))}
          </View>
        )}

        {card.friendsLiked && card.friendsLiked.length > 0 && (
          <Text style={styles.friends}>
            ♥ {card.friendsLiked.slice(0, 2).join(", ")}
            {card.friendsLiked.length > 2 ? ` +${card.friendsLiked.length - 2}` : ""} liked this
          </Text>
        )}
      </View>
    </Animated.View>
  );

  return isTop ? <GestureDetector gesture={pan}>{body}</GestureDetector> : body;
}

function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: width - space(10),
    height: "84%",
    borderRadius: radius.card,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  stretchCard: { borderWidth: 2, borderColor: color.stretch },
  photo: { ...StyleSheet.absoluteFillObject, resizeMode: "cover" },
  meta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space(5),
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  name: { color: color.text, fontSize: 27, fontFamily: font.display },
  sub: { color: color.textDim, marginTop: space(1), fontFamily: font.body },
  match: { color: color.gold, marginTop: space(2), fontFamily: font.label, fontWeight: "600" },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5), marginTop: space(2.5) },
  chip: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  chipText: { color: color.text, fontSize: 12, fontFamily: font.label },
  friends: { color: color.yes, marginTop: space(2), fontSize: 13, fontFamily: font.body },
  stretchBadge: {
    position: "absolute",
    top: space(4),
    alignSelf: "center",
    backgroundColor: color.stretch,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  stretchBadgeText: { color: color.text, fontSize: 11, fontFamily: font.label, letterSpacing: 0.5 },
  stamp: {
    position: "absolute",
    top: space(9),
    paddingHorizontal: space(3),
    paddingVertical: space(1),
    borderWidth: 3,
    borderRadius: radius.sm,
  },
  like: { left: space(5), borderColor: color.yes, transform: [{ rotate: "-13deg" }] },
  pass: { right: space(5), borderColor: color.primary, transform: [{ rotate: "13deg" }] },
  superLike: { alignSelf: "center", borderColor: color.gold },
  stampText: { fontSize: 26, fontFamily: font.label, fontWeight: "800", color: color.text },
});
