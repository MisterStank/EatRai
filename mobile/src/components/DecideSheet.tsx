import React, { useEffect, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Card } from "../api/client";
import { color, font, radius, space } from "../theme/tokens";
import { fmtCuisines, fmtDistance, fmtPriceRange, fmtRating } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";
import { weightedPick } from "../lib/decide";
import { openExternal } from "../lib/linking";

export function DecideSheet({
  visible,
  candidates,
  fromLikes,
  onClose,
  onOpenDetail,
}: {
  visible: boolean;
  candidates: Card[];
  fromLikes: boolean;
  onClose: () => void;
  onOpenDetail: (card: Card) => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const [pick, setPick] = useState<Card | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setPick(weightedPick(candidates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const reroll = () => setPick((prev) => weightedPick(candidates, prev?.id));

  if (!pick) return null;

  const photo = pick.photoUrls?.find(Boolean);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.screen}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#F4AE63", "#E7743A", "#BE4127"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(20,14,7,0.55)", "rgba(20,14,7,0.35)", "rgba(20,14,7,0.94)"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />

        <Pressable style={[styles.close, { top: insets.top + space(2) }]} onPress={onClose} hitSlop={8}>
          <Feather name="x" size={20} color="#fff" />
        </Pressable>

        <View style={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
          <Text style={styles.kicker}>{t("decideKicker")}</Text>
          <Text style={styles.name}>{pick.name}</Text>
          <Text style={styles.source}>
            {fromLikes ? t("decideFromLikes") : t("decideFromNearby")}
          </Text>

          <View style={styles.chips}>
            <Chip>{fmtDistance(pick.distanceM, lang)}</Chip>
            {pick.rating > 0 ? <Chip icon="star">{fmtRating(pick.rating)}</Chip> : null}
            {fmtPriceRange(pick.priceRange) ? <Chip>{fmtPriceRange(pick.priceRange)}</Chip> : null}
            {fmtCuisines(pick.cuisines) ? <Chip>{fmtCuisines(pick.cuisines)}</Chip> : null}
          </View>

          <Pressable style={styles.primary} onPress={() => openExternal(pick.mapsUri)}>
            <Feather name="navigation" size={17} color="#fff" />
            <Text style={styles.primaryText}>{t("directions")}</Text>
          </Pressable>

          <View style={styles.secondaryRow}>
            <Pressable
              style={styles.secondary}
              onPress={() => {
                onOpenDetail(pick);
              }}
            >
              <Text style={styles.secondaryText}>{t("decideDetails")}</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={reroll}>
              <Feather name="refresh-cw" size={14} color="#fff" />
              <Text style={styles.secondaryText}>{t("decideAgain")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ children, icon }: { children: React.ReactNode; icon?: any }) {
  return (
    <View style={styles.chip}>
      {icon ? <Feather name={icon} size={11} color={color.gold} /> : null}
      <Text style={styles.chipText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  close: {
    position: "absolute",
    right: space(4),
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, justifyContent: "flex-end", paddingHorizontal: space(6) },
  kicker: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.8)",
  },
  name: {
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 44,
    color: "#fff",
    letterSpacing: -0.5,
    marginTop: space(2),
  },
  source: { fontFamily: font.body, fontSize: 13.5, color: "rgba(255,255,255,0.75)", marginTop: space(2.5) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(4) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.25),
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  chipText: { color: "#fff", fontFamily: font.bodySemi, fontSize: 12.5 },
  primary: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    marginTop: space(6),
  },
  primaryText: { fontFamily: font.display, fontSize: 17, color: "#fff" },
  secondaryRow: { flexDirection: "row", gap: space(3), marginTop: space(3) },
  secondary: {
    flex: 1,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
  },
  secondaryText: { fontFamily: font.displaySemi, fontSize: 14, color: "#fff" },
});
