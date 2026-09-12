import React, { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";

const MENU_W = 276;

export function TopBar({
  locationLabel,
  filterCount,
  onLocation,
  onFilter,
  onHelp,
  onFeedback,
  onSupport,
  onLegal,
}: {
  locationLabel: string;
  filterCount: number;
  onLocation: () => void;
  onFilter: () => void;
  onHelp: () => void;
  onFeedback: () => void;
  onSupport: () => void;
  onLegal: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const setLang = useSession((s) => s.setLang);
  const menuBtnRef = useRef<View | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [menuMounted, setMenuMounted] = useState(false);
  const reduced = useReducedMotion();
  const anim = useSharedValue(0); // 0 = closed, 1 = open

  // Anchor the dropdown to the menu button's on-screen position. The Modal is a
  // full-window overlay, so window coords are what it needs — a static `right`
  // offset would drift off the button whenever the app column is centred (web).
  // Open on a viewport-derived guess immediately, then correct once measured
  // (measureInWindow resolves synchronously on web, next frame on native).
  const openMenu = () => {
    const { width } = Dimensions.get("window");
    setAnchor({ top: space(24), left: Math.max(space(2), width - space(4.5) - MENU_W) });
    menuBtnRef.current?.measureInWindow?.((x, y, w, h) => {
      setAnchor({ top: y + h + space(1.5), left: Math.max(space(2), x + w - MENU_W) });
    });
    setMenuMounted(true);
    anim.value = withTiming(1, { duration: reduced ? 0 : 160, easing: Easing.out(Easing.cubic) });
  };

  const closeMenu = () => {
    anim.value = withTiming(0, { duration: reduced ? 0 : 120, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(setMenuMounted)(false);
    });
  };

  const run = (fn: () => void) => () => {
    closeMenu();
    fn();
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: anim.value }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
    transform: [
      { scale: 0.92 + 0.08 * anim.value },
      { translateY: -10 * (1 - anim.value) },
    ],
  }));

  return (
    <View style={styles.bar}>
      <Pressable onPress={onLocation} style={styles.pill} hitSlop={6}>
        <View style={styles.pillLabel}>
          <Feather name="map-pin" size={14} color={color.accent} />
          <Text style={styles.pillText} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
        <Feather name="chevron-down" size={13} color={color.inkFaint} />
      </Pressable>

      <View style={styles.right}>
        <Pressable
          onPress={() => setLang(lang === "en" ? "th" : "en")}
          style={styles.langBtn}
          hitSlop={6}
          accessibilityLabel={t("a11yLanguage")}
        >
          <Text style={styles.langText}>{lang === "en" ? "EN" : "TH"}</Text>
        </Pressable>

        <Pressable onPress={onFilter} style={styles.iconBtn} hitSlop={6} accessibilityLabel={t("a11yFilters")}>
          <Feather name="sliders" size={19} color={color.ink} />
          {filterCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          ref={menuBtnRef}
          onPress={openMenu}
          style={styles.iconBtn}
          hitSlop={6}
          accessibilityLabel={t("a11yMenu")}
        >
          <Feather name="menu" size={19} color={color.ink} />
        </Pressable>
      </View>

      <Modal visible={menuMounted} transparent animationType="none" onRequestClose={closeMenu}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
          <Animated.View style={[styles.menuBackdrop, backdropStyle]} pointerEvents="none" />
          <Animated.View style={[styles.menu, anchor ?? undefined, menuStyle]}>
            <Pressable onPress={() => {}}>
              <MenuRow icon="help-circle" label={t("howToUse")} onPress={run(onHelp)} />
              <View style={styles.menuDivider} />
              <MenuRow icon="message-square" label={t("giveFeedback")} onPress={run(onFeedback)} />
              <View style={styles.menuDivider} />
              <MenuRow icon="coffee" label={t("supportDev")} onPress={run(onSupport)} />
              <View style={styles.menuDivider} />
              <MenuRow icon="shield" label={t("privacyTerms")} onPress={run(onLegal)} />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Feather name={icon} size={17} color={color.inkSoft} />
      <Text style={styles.menuRowText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(4.5),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // Fixed target width, but allowed to shrink (label ellipsises) so the
    // language / filter / menu buttons never get pushed off a 375pt screen.
    width: 168,
    flexShrink: 1,
    minWidth: 0,
    marginRight: space(1.5),
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(3.5),
    paddingVertical: space(2.25),
  },
  pillLabel: { flexDirection: "row", alignItems: "center", gap: space(1.75), flexShrink: 1 },
  pillText: { color: color.ink, fontFamily: font.bodySemi, fontSize: 14, flexShrink: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: space(1.75), flexShrink: 0 },
  langBtn: {
    minWidth: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space(2),
  },
  langText: { fontFamily: font.bodyBold, fontSize: 13, color: color.ink },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 11 },
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(23,20,15,0.12)" },
  menu: {
    position: "absolute",
    width: MENU_W,
    transformOrigin: "top right",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingVertical: space(1),
    shadowColor: "#17140F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  menuDivider: { height: 1, backgroundColor: color.line, marginHorizontal: space(3) },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
  },
  menuRowText: { fontFamily: font.bodySemi, fontSize: 14.5, color: color.ink, flexShrink: 1 },
});
