import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { color, font, radius, space } from "../theme/tokens";
import { useT, type TKey } from "../lib/i18n";

// A short guided walkthrough of the deck. Four pages: the first three animate a
// schematic card to show a single gesture, the last is a plain reference list.
// Motion is synthetic (reanimated only, no assets) and pauses when a page is
// off-screen or the OS has Reduce Motion turned on.

type DemoProps = { active: boolean; reduced: boolean };

const MIN = 260; // demo stage height

// --- schematic card -------------------------------------------------------

function CardShell({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: any;
}) {
  return (
    <Animated.View style={[styles.card, style]}>
      <View style={styles.cardPhoto}>{children}</View>
      <View style={styles.cardInfo}>
        <View style={[styles.bar, { width: "64%" }]} />
        <View style={[styles.bar, { width: "40%", height: 8, marginTop: 7 }]} />
      </View>
    </Animated.View>
  );
}

function Finger({ style }: { style?: any }) {
  return <Animated.View style={[styles.finger, style]} />;
}

// --- page 1: swipe or tap ----------------------------------------------------

function DemoSwipe({ active, reduced }: DemoProps) {
  const p = useSharedValue(0); // 0..4 loop: 0-1 rest, 1-2 right, 2-3 rest, 3-4 left

  useEffect(() => {
    if (!active || reduced) return;
    p.value = 0;
    p.value = withRepeat(withTiming(4, { duration: 4000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [active, reduced, p]);

  const x = (v: number) =>
    interpolate(v, [0, 1, 1.9, 2, 3, 3.9, 4], [0, 0, 150, 0, 0, -150, 0], Extrapolation.CLAMP);

  const cardStyle = useAnimatedStyle(() => {
    const tx = x(p.value);
    return {
      transform: [{ translateX: tx }, { rotate: `${(tx / 150) * 12}deg` }],
      opacity: 1 - Math.min(Math.abs(tx) / 260, 0.55),
    };
  });
  const likeStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, x(p.value) / 110) }));
  const nopeStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, -x(p.value) / 110) }));
  const likeBtn = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + Math.max(0, x(p.value) / 150) * 0.18 }],
  }));
  const nopeBtn = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + Math.max(0, -x(p.value) / 150) * 0.18 }],
  }));

  if (reduced) {
    return (
      <View style={styles.stage}>
        <CardShell style={{ transform: [{ rotate: "6deg" }] }}>
          <View style={[styles.stamp, styles.stampLike]}>
            <Text style={styles.stampLikeText}>LIKE</Text>
          </View>
        </CardShell>
        <View style={styles.demoBtns}>
          <View style={styles.demoBtn}>
            <Feather name="x" size={20} color={color.nope} />
          </View>
          <View style={styles.demoBtn}>
            <Feather name="heart" size={18} color={color.like} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      <CardShell style={cardStyle}>
        <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
          <Text style={styles.stampLikeText}>LIKE</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampNope, nopeStyle]}>
          <Text style={styles.stampNopeText}>NOPE</Text>
        </Animated.View>
      </CardShell>
      <View style={styles.demoBtns}>
        <Animated.View style={[styles.demoBtn, nopeBtn]}>
          <Feather name="x" size={20} color={color.nope} />
        </Animated.View>
        <Animated.View style={[styles.demoBtn, likeBtn]}>
          <Feather name="heart" size={18} color={color.like} />
        </Animated.View>
      </View>
    </View>
  );
}

// --- page 2: see more ------------------------------------------------------

function DemoMore({ active, reduced }: DemoProps) {
  const p = useSharedValue(0); // 0..4 loop

  useEffect(() => {
    if (!active || reduced) return;
    p.value = 0;
    p.value = withRepeat(withTiming(4, { duration: 4200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [active, reduced, p]);

  // finger sits over the photo for p<3 (tapping), then drops to the name row
  const fingerStyle = useAnimatedStyle(() => {
    const top = interpolate(p.value, [0, 3, 3.5, 4], [58, 58, 150, 150], Extrapolation.CLAMP);
    const phase = p.value % 1;
    const dip = interpolate(phase, [0, 0.15, 0.35, 1], [1, 0.82, 1, 1], Extrapolation.CLAMP);
    return { top, transform: [{ scale: dip }] };
  });

  const dot = (i: number) =>
    useAnimatedStyle(() => {
      const on = interpolate(
        p.value,
        [i - 0.5, i, i + 0.9, i + 1.4],
        [0.25, 1, 1, 0.25],
        Extrapolation.CLAMP,
      );
      return { opacity: on, width: 6 + on * 10 };
    });
  const dot0 = dot(0);
  const dot1 = dot(1);
  const dot2 = dot(2);

  const photoStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      Math.floor(p.value) % 3,
      [0, 1, 2],
      [color.surfaceAlt, "#E7E7DA", "#EFE6D6"],
    ),
  }));

  const panelStyle = useAnimatedStyle(() => {
    const v = interpolate(p.value, [3, 3.5, 4], [0, 1, 1], Extrapolation.CLAMP);
    return { opacity: v, transform: [{ translateY: (1 - v) * 40 }] };
  });

  const reducedFrame = reduced;

  return (
    <View style={styles.stage}>
      <View style={styles.card}>
        <Animated.View style={[styles.cardPhoto, reducedFrame ? undefined : photoStyle]}>
          <View style={styles.photoDots}>
            <Animated.View style={[styles.photoDot, reducedFrame ? { width: 16 } : dot0]} />
            <Animated.View style={[styles.photoDot, reducedFrame ? undefined : dot1]} />
            <Animated.View style={[styles.photoDot, reducedFrame ? undefined : dot2]} />
          </View>
        </Animated.View>
        <View style={styles.cardInfo}>
          <View style={[styles.bar, { width: "64%" }]} />
          <View style={[styles.bar, { width: "40%", height: 8, marginTop: 7 }]} />
        </View>

        <Animated.View style={[styles.detailPanel, reducedFrame ? { opacity: 1 } : panelStyle]}>
          <View style={[styles.bar, { width: "50%", backgroundColor: "rgba(255,255,255,0.9)" }]} />
          <View
            style={[
              styles.bar,
              { width: "72%", height: 7, marginTop: 6, backgroundColor: "rgba(255,255,255,0.6)" },
            ]}
          />
          <View
            style={[
              styles.bar,
              { width: "60%", height: 7, marginTop: 5, backgroundColor: "rgba(255,255,255,0.6)" },
            ]}
          />
        </Animated.View>
      </View>

      {!reducedFrame ? <Finger style={fingerStyle} /> : null}
    </View>
  );
}

// --- page 3: undo --------------------------------------------------------

function DemoUndo({ active, reduced }: DemoProps) {
  const p = useSharedValue(0); // 0..3 loop

  useEffect(() => {
    if (!active || reduced) return;
    p.value = 0;
    p.value = withRepeat(withTiming(3, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [active, reduced, p]);

  const cardStyle = useAnimatedStyle(() => {
    const tx = interpolate(p.value, [0, 0.9, 1.8, 2.6, 3], [0, -170, -170, 0, 0], Extrapolation.CLAMP);
    return {
      transform: [{ translateX: tx }, { rotate: `${(tx / 170) * 14}deg` }],
      opacity: interpolate(p.value, [0, 0.9, 1.8, 2.6, 3], [1, 0.15, 0.15, 1, 1], Extrapolation.CLAMP),
    };
  });
  const undoStyle = useAnimatedStyle(() => {
    const s = interpolate(p.value, [1, 1.4, 1.9], [1, 1.28, 1], Extrapolation.CLAMP);
    return {
      transform: [{ scale: reduced ? 1 : s }],
      borderColor: interpolateColor(
        interpolate(p.value, [1, 1.4, 1.9], [0, 1, 0], Extrapolation.CLAMP),
        [0, 1],
        [color.line, color.accent],
      ),
    };
  });

  return (
    <View style={styles.stage}>
      <CardShell style={reduced ? { transform: [{ translateX: -60 }, { rotate: "-8deg" }] } : cardStyle} />
      <View style={styles.demoBtns}>
        <Animated.View style={[styles.demoBtn, styles.undoBtn, undoStyle]}>
          <Feather name="rotate-ccw" size={18} color={color.accent} />
        </Animated.View>
      </View>
    </View>
  );
}

// --- page 4: reference ---------------------------------------------------

const REF: { icon: keyof typeof Feather.glyphMap; title: TKey; body: TKey }[] = [
  { icon: "map-pin", title: "guideRefAreaTitle", body: "guideRefAreaBody" },
  { icon: "sliders", title: "guideRefFiltersTitle", body: "guideRefFiltersBody" },
  { icon: "zap", title: "guideRefDecideTitle", body: "guideRefDecideBody" },
  { icon: "heart", title: "guideRefListTitle", body: "guideRefListBody" },
];

function GuideReference() {
  const t = useT();
  return (
    <ScrollView
      style={styles.refList}
      contentContainerStyle={{ paddingBottom: space(4) }}
      showsVerticalScrollIndicator={false}
    >
      {REF.map((r) => (
        <View key={r.title} style={styles.refRow}>
          <View style={styles.refIcon}>
            <Feather name={r.icon} size={16} color={color.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.refTitle}>{t(r.title)}</Text>
            <Text style={styles.refBody}>{t(r.body)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// --- pages -------------------------------------------------------------------

const PAGES: {
  key: string;
  title: TKey;
  body?: TKey;
  Demo?: React.FC<DemoProps>;
}[] = [
  { key: "swipe", title: "guideSwipeTitle", body: "guideSwipeBody", Demo: DemoSwipe },
  { key: "more", title: "guideMoreTitle", body: "guideMoreBody", Demo: DemoMore },
  { key: "undo", title: "guideUndoTitle", body: "guideUndoBody", Demo: DemoUndo },
  { key: "ref", title: "guideRefTitle" },
];

export function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const pageW = Math.min(width, 480);
  const last = PAGES.length - 1;

  useEffect(() => {
    if (!visible) return;
    setPage(0);
    requestAnimationFrame(() => scroller.current?.scrollTo({ x: 0, animated: false }));
  }, [visible]);

  const goTo = (n: number) => {
    const clamped = Math.max(0, Math.min(last, n));
    scroller.current?.scrollTo({ x: clamped * pageW, animated: true });
    setPage(clamped);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.kicker}>{t("helpTitle")}</Text>
          {page < last ? (
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.skip}>{t("guideSkip")}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 1 }} />
          )}
        </View>

        <View style={styles.pagerWrap}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / pageW))
          }
          style={{ flex: 1, width: pageW }}
        >
          {PAGES.map((pg, i) =>
            pg.key === "ref" ? (
              <View key={pg.key} style={[styles.page, { width: pageW }]}>
                <View style={[styles.copy, { paddingTop: space(2), paddingBottom: space(3) }]}>
                  <Text style={styles.pageTitle}>{t(pg.title)}</Text>
                </View>
                <GuideReference />
              </View>
            ) : (
              <View key={pg.key} style={[styles.page, { width: pageW }]}>
                <View style={styles.demoWrap}>
                  {pg.Demo ? <pg.Demo active={visible && page === i} reduced={reduced} /> : null}
                </View>
                <View style={styles.copy}>
                  {i === 0 ? <Text style={styles.intro}>{t("helpIntro")}</Text> : null}
                  <Text style={styles.pageTitle}>{t(pg.title)}</Text>
                  {pg.body ? <Text style={styles.pageBody}>{t(pg.body)}</Text> : null}
                </View>
              </View>
            ),
          )}
        </ScrollView>
        </View>

        <View style={styles.dots}>
          {PAGES.map((pg, i) => (
            <View key={pg.key} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>

        <View style={styles.footer}>
          {page > 0 ? (
            <Pressable style={styles.backBtn} onPress={() => goTo(page - 1)} hitSlop={8}>
              <Text style={styles.backText}>{t("guideBack")}</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable
            style={styles.nextBtn}
            onPress={() => (page === last ? onClose() : goTo(page + 1))}
          >
            <Text style={styles.nextText}>{page === last ? t("gotIt") : t("guideNext")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper, paddingTop: space(12) },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(5.5),
    marginBottom: space(2),
  },
  kicker: { fontFamily: font.display, fontSize: 26, color: color.ink, letterSpacing: -0.5 },
  skip: { fontFamily: font.bodySemi, fontSize: 14, color: color.inkSoft },

  pagerWrap: { flex: 1, alignItems: "center", alignSelf: "stretch" },
  page: { flex: 1, paddingHorizontal: space(6) },
  demoWrap: { flex: 1, minHeight: MIN, alignItems: "center", justifyContent: "center" },
  copy: { paddingBottom: space(3) },
  intro: { fontFamily: font.body, fontSize: 13.5, color: color.inkFaint, marginBottom: space(1.5) },
  pageTitle: { fontFamily: font.display, fontSize: 21, color: color.ink, letterSpacing: -0.3 },
  pageBody: {
    fontFamily: font.body,
    fontSize: 14.5,
    color: color.inkSoft,
    lineHeight: 21,
    marginTop: space(2),
  },

  // schematic card
  stage: { width: 210, height: MIN, alignItems: "center", justifyContent: "center" },
  card: {
    width: 186,
    height: 210,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    overflow: "hidden",
    shadowColor: "#17140F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  cardPhoto: { flex: 1, backgroundColor: color.surfaceAlt, justifyContent: "flex-end" },
  cardInfo: { padding: space(4) },
  bar: { height: 11, borderRadius: 5, backgroundColor: "rgba(23,20,15,0.12)" },

  photoDots: {
    flexDirection: "row",
    gap: 5,
    alignSelf: "center",
    marginBottom: space(3),
  },
  photoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },

  detailPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space(4),
    paddingTop: space(4),
    backgroundColor: "rgba(23,20,15,0.82)",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },

  stamp: {
    position: "absolute",
    top: space(4),
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  stampLike: { left: space(4), borderColor: color.like, transform: [{ rotate: "-14deg" }] },
  stampNope: { right: space(4), borderColor: color.nope, transform: [{ rotate: "14deg" }] },
  stampLikeText: { fontFamily: font.bodyBold, fontSize: 13, color: color.like, letterSpacing: 1 },
  stampNopeText: { fontFamily: font.bodyBold, fontSize: 13, color: color.nope, letterSpacing: 1 },

  demoBtns: {
    flexDirection: "row",
    gap: space(5),
    marginTop: space(5),
  },
  demoBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  undoBtn: { borderWidth: 2 },

  finger: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "rgba(23,20,15,0.35)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },

  // reference page
  refList: { flex: 1 },
  refRow: {
    flexDirection: "row",
    gap: space(3.5),
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space(3.5),
    marginBottom: space(3),
  },
  refIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: color.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  refTitle: { fontFamily: font.displaySemi, fontSize: 15, color: color.ink },
  refBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: color.inkSoft,
    marginTop: space(1),
    lineHeight: 18,
  },

  dots: {
    flexDirection: "row",
    gap: space(1.5),
    justifyContent: "center",
    paddingVertical: space(3),
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.line },
  dotOn: { width: 18, backgroundColor: color.accent },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(5.5),
    paddingTop: space(3),
    paddingBottom: space(6),
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  backBtn: { flex: 1, height: 52, alignItems: "flex-start", justifyContent: "center" },
  backText: { fontFamily: font.bodySemi, fontSize: 15, color: color.inkSoft },
  nextBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  nextText: { fontFamily: font.display, fontSize: 15, color: "#fff" },
});
