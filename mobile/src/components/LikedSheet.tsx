import React from "react";
import { Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color, font, radius, space } from "../theme/tokens";
import { fmtCuisines, fmtDistance, fmtPrice, fmtRating } from "../lib/format";
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
  const open = (c: Card) => Linking.openURL(c.mapsUri).catch(() => {});

  const confirmClear = () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Clear all saved places on this device?")) onClear();
      return;
    }
    Alert.alert("Clear your list?", "This removes all saved places on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear all", style: "destructive", onPress: onClear },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
          <Feather name="x" size={18} color={color.ink} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.kicker}>Saved</Text>
          <Text style={styles.count}>
            {liked.length} {liked.length === 1 ? "place" : "places"}
          </Text>
          <Text style={styles.sub}>Tap one to open it in Maps or call ahead.</Text>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: space(6) }} showsVerticalScrollIndicator={false}>
          {liked.map((c) => (
            <View key={c.id} style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => open(c)}>
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
                    {[fmtPrice(c.priceLevel), fmtCuisines(c.cuisines), fmtDistance(c.distanceM)].filter(Boolean).join(" · ")}
                  </Text>
                  {c.rating > 0 || c.openKnown ? (
                    <Text style={[styles.rowMeta, { color: c.openNow ? color.like : color.inkFaint }]} numberOfLines={1}>
                      {[c.rating > 0 ? `★ ${fmtRating(c.rating)}` : "", c.openKnown ? (c.openNow ? "Open now" : "Closed") : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <Feather name="corner-up-right" size={19} color={color.inkFaint} style={styles.go} />
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
          {liked.length === 0 ? <Text style={styles.empty}>Nothing yet — swipe right on a place you like.</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.keep} onPress={onClose}>
            <Text style={styles.keepText}>Keep swiping</Text>
          </Pressable>
          {liked.length > 0 ? (
            <Pressable onPress={confirmClear} style={styles.clearBtn} hitSlop={6}>
              <Text style={styles.clearText}>Clear all</Text>
            </Pressable>
          ) : null}
          <Text style={styles.note}>Saved on this device — not synced, cleared if you delete the app.</Text>
        </View>
      </View>
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
  count: { fontFamily: font.display, fontSize: 34, color: color.ink, letterSpacing: -0.8, marginTop: space(0.5) },
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
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3.5),
    padding: space(3),
    paddingRight: space(4),
  },
  thumb: { width: 60, height: 60, borderRadius: radius.md },
  rowMid: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.displaySemi, fontSize: 16, color: color.ink },
  rowSub: { fontFamily: font.body, fontSize: 13, color: color.inkSoft, marginTop: space(0.75) },
  rowMeta: { fontFamily: font.bodySemi, fontSize: 12, marginTop: space(0.75) },
  go: { marginLeft: space(1) },
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
  footer: { paddingHorizontal: space(4.5), paddingTop: space(4), paddingBottom: space(5), borderTopWidth: 1, borderTopColor: color.line },
  keep: { height: 52, borderRadius: radius.lg, borderWidth: 1.5, borderColor: color.ink, alignItems: "center", justifyContent: "center" },
  keepText: { fontFamily: font.display, fontSize: 15, color: color.ink },
  clearBtn: { alignSelf: "center", marginTop: space(3), paddingVertical: space(1) },
  clearText: { fontFamily: font.bodySemi, fontSize: 13.5, color: color.nope },
  note: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textAlign: "center", marginTop: space(2.5) },
});
