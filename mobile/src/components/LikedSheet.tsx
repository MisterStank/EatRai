import React, { useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { fmtCuisines, fmtDistance, fmtPrice, fmtRating } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";
import { buildShareURL } from "../lib/sharing";
import { RestaurantSheet } from "./RestaurantSheet";
import type { Card } from "../api/client";

export function LikedSheet({
  visible,
  liked,
  onRemove,
  onClear,
  onClose,
}: {
  visible: boolean;
  liked: Card[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const [detail, setDetail] = useState<Card | null>(null);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = buildShareURL(liked);
    if (Platform.OS === "web") {
      const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
      if (nav?.share) {
        nav.share({ title: "EatRai", url }).catch(() => {});
      } else {
        await Clipboard.setStringAsync(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      return;
    }
    Share.share({ message: url, url }).catch(() => {});
  };

  const confirmClear = () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(t("clearBody"))) onClear();
      return;
    }
    Alert.alert(t("clearTitle"), t("clearBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("clearAll"), style: "destructive", onPress: onClear },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
          <Feather name="x" size={18} color={color.ink} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.kicker}>{t("saved")}</Text>
          <Text style={styles.count}>{t("nPlaces", { n: liked.length })}</Text>
          <Text style={styles.sub}>{t("savedSub")}</Text>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: space(4) }} showsVerticalScrollIndicator={false}>
          {liked.map((c) => (
            <View key={c.id} style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => setDetail(c)}>
                {c.photoUrls?.[0] ? (
                  <Image source={{ uri: c.photoUrls[0] }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: color.accent }]} />
                )}
                <View style={styles.rowMid}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[fmtPrice(c.priceLevel), fmtCuisines(c.cuisines), fmtDistance(c.distanceM, lang)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {c.rating > 0 || c.openKnown ? (
                    <Text style={[styles.rowMeta, { color: c.openNow ? color.like : color.inkFaint }]} numberOfLines={1}>
                      {[c.rating > 0 ? `★ ${fmtRating(c.rating)}` : "", c.openKnown ? (c.openNow ? t("open") : t("closed")) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={20} color={color.inkFaint} style={{ marginLeft: space(1) }} />
              </Pressable>
              <Pressable
                style={styles.remove}
                onPress={() => onRemove(c.id)}
                hitSlop={10}
                accessibilityLabel={`Remove ${c.name}`}
              >
                <Feather name="x" size={13} color={color.inkFaint} />
              </Pressable>
            </View>
          ))}
          {liked.length === 0 ? <Text style={styles.empty}>{t("nothingSaved")}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          {liked.length > 0 ? (
            <Pressable style={styles.shareBtn} onPress={share}>
              <Feather name={copied ? "check" : "share-2"} size={16} color="#fff" />
              <Text style={styles.shareText}>{copied ? t("linkCopied") : t("shareList")}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.keep} onPress={onClose}>
            <Text style={styles.keepText}>{t("keepSwiping")}</Text>
          </Pressable>
          {liked.length > 0 ? (
            <Pressable onPress={confirmClear} style={styles.clearBtn} hitSlop={6}>
              <Text style={styles.clearText}>{t("clearAll")}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.note}>{t("savedNote")}</Text>
        </View>
      </View>

      <RestaurantSheet visible={!!detail} card={detail} onClose={() => setDetail(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper, paddingTop: space(14) },
  close: {
    position: "absolute",
    top: space(4),
    left: space(4.5),
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  header: { paddingHorizontal: space(5.5), marginBottom: space(4) },
  kicker: { fontFamily: font.bodySemi, fontSize: 15, color: color.inkSoft },
  count: { fontFamily: font.display, fontSize: 32, color: color.ink, letterSpacing: -0.6, marginTop: space(0.5) },
  sub: { fontFamily: font.body, fontSize: 14, color: color.inkSoft, marginTop: space(2) },
  list: { flex: 1, paddingHorizontal: space(4.5) },
  row: {
    position: "relative",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    marginBottom: space(3),
  },
  rowMain: { flexDirection: "row", alignItems: "center", gap: space(3.5), padding: space(3), paddingRight: space(4) },
  thumb: { width: 60, height: 60, borderRadius: radius.md },
  rowMid: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.displaySemi, fontSize: 16, color: color.ink },
  rowSub: { fontFamily: font.body, fontSize: 13, color: color.inkSoft, marginTop: space(0.75) },
  rowMeta: { fontFamily: font.bodySemi, fontSize: 12, marginTop: space(0.75) },
  remove: {
    position: "absolute",
    top: space(2),
    right: space(2),
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: color.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkSoft, textAlign: "center", marginTop: space(10) },
  footer: { paddingHorizontal: space(4.5), paddingTop: space(4), paddingBottom: space(5), borderTopWidth: 1, borderTopColor: color.line, gap: space(3) },
  shareBtn: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
  },
  shareText: { fontFamily: font.display, fontSize: 15, color: "#fff" },
  keep: { height: 52, borderRadius: radius.lg, borderWidth: 1.5, borderColor: color.ink, alignItems: "center", justifyContent: "center" },
  keepText: { fontFamily: font.display, fontSize: 15, color: color.ink },
  clearBtn: { alignSelf: "center", paddingVertical: space(0.5) },
  clearText: { fontFamily: font.bodySemi, fontSize: 13.5, color: color.nope },
  note: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textAlign: "center" },
});
