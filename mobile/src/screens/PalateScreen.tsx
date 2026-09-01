import React, { useEffect } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useAuth } from "../store/auth";
import { color, font, radius, space } from "../theme/tokens";

export function PalateScreen() {
  const { me, refreshMe, signOut } = useAuth();

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const max = me?.palate[0]?.weight ?? 1;

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refreshMe} tintColor={color.textDim} />}
    >
      <Text style={styles.h}>Your palate</Text>
      <Text style={styles.sub}>
        {me?.profileReady
          ? `Learned from ${me.swipeCount} swipes.`
          : `Keep swiping — ${Math.max(0, 12 - (me?.swipeCount ?? 0))} more to unlock recommendations.`}
      </Text>

      {me?.adventureStreak ? (
        <View style={styles.streak}>
          <Text style={styles.streakText}>🔥 {me.adventureStreak}-swipe adventure streak</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Top dimensions</Text>
      {me?.palate.map((d) => (
        <View key={d.key} style={styles.barRow}>
          <Text style={styles.barLabel}>{d.label}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((d.weight / max) * 100)}%` }]} />
          </View>
        </View>
      ))}
      {(!me || me.palate.length === 0) && <Text style={styles.sub}>Nothing learned yet.</Text>}

      {me?.mood && (me.mood.more.length > 0 || me.mood.less.length > 0) && (
        <>
          <Text style={styles.section}>Lately you've been into…</Text>
          {me.mood.more.length > 0 && (
            <Text style={styles.moodMore}>↑ more {me.mood.more.join(", ")}</Text>
          )}
          {me.mood.less.length > 0 && (
            <Text style={styles.moodLess}>↓ less {me.mood.less.join(", ")}</Text>
          )}
        </>
      )}

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg },
  content: { padding: space(6), paddingTop: space(15) },
  h: { color: color.text, fontFamily: font.display, fontSize: 28 },
  sub: { color: color.textDim, fontFamily: font.body, marginTop: space(2) },
  section: { color: color.text, fontFamily: font.label, fontWeight: "700", marginTop: space(7), marginBottom: space(3), fontSize: 16 },
  streak: {
    marginTop: space(4),
    backgroundColor: color.surfaceAlt,
    borderRadius: radius.sm,
    padding: space(3),
    alignSelf: "flex-start",
  },
  streakText: { color: color.gold, fontFamily: font.label },
  barRow: { marginBottom: space(3) },
  barLabel: { color: color.text, fontFamily: font.body, marginBottom: space(1.5) },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: color.surfaceAlt, overflow: "hidden" },
  fill: { height: 10, borderRadius: radius.pill, backgroundColor: color.primary },
  moodMore: { color: color.yes, fontFamily: font.body, marginBottom: space(1) },
  moodLess: { color: color.textDim, fontFamily: font.body },
  signOut: { marginTop: space(12), alignSelf: "flex-start" },
  signOutText: { color: color.primary, fontFamily: font.label },
});
