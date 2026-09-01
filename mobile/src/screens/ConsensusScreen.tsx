import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRoute } from "@react-navigation/native";
import * as Location from "expo-location";
import { consensusDeck, type ConsensusCard, type Friend } from "../api/client";
import { color, font, radius, space } from "../theme/tokens";

export function ConsensusScreen() {
  const { params } = useRoute<any>();
  const friends: Friend[] = params?.friends ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set(friends.map((f) => f.id)));
  const [cards, setCards] = useState<ConsensusCard[] | null>(null);
  const [loading, setLoading] = useState(false);

  const ids = useMemo(() => [...selected], [selected]);

  const run = async () => {
    setLoading(true);
    setCards(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      const res = await consensusDeck(ids, pos.coords.latitude, pos.coords.longitude);
      setCards(res.cards);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ids.length) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>Where you'd all agree</Text>
      <Text style={styles.sub}>
        Ranked so the person who'd like it least still likes it — not just the group average.
      </Text>

      <View style={styles.chips}>
        {friends.map((f) => {
          const on = selected.has(f.id);
          return (
            <Pressable
              key={f.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  n.has(f.id) ? n.delete(f.id) : n.add(f.id);
                  return n;
                })
              }
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.displayName}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.run} onPress={run}>
        <Text style={styles.runText}>Rebuild deck ({ids.length + 1} people)</Text>
      </Pressable>

      {loading && <ActivityIndicator color={color.primary} style={{ marginTop: space(8) }} />}

      <FlatList
        data={cards ?? []}
        keyExtractor={(c) => c.id}
        style={{ marginTop: space(4) }}
        ListEmptyComponent={
          !loading && cards ? <Text style={styles.sub}>Nothing everyone would go for nearby.</Text> : null
        }
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.photoUrls[0] }} style={styles.thumb} />
            <View style={styles.cardBody}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.dim}>
                {item.cuisines.slice(0, 2).join(", ")} · {Math.round(item.groupScore)}% group fit
                {item.likedBy > 0 ? ` · ${item.likedBy} already liked` : ""}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg, paddingTop: space(15), paddingHorizontal: space(5) },
  h: { color: color.text, fontFamily: font.display, fontSize: 25 },
  sub: { color: color.textDim, fontFamily: font.body, marginTop: space(2) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(4) },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { color: color.textDim, fontFamily: font.label, fontSize: 13 },
  chipTextOn: { color: color.text },
  run: { marginTop: space(4), backgroundColor: color.surfaceAlt, borderRadius: radius.sm, padding: space(3), alignItems: "center" },
  runText: { color: color.text, fontFamily: font.label },
  card: { flexDirection: "row", backgroundColor: color.surface, borderRadius: radius.sm, marginBottom: space(3), overflow: "hidden" },
  thumb: { width: 84, height: 84 },
  cardBody: { flex: 1, padding: space(3) },
  rank: { color: color.gold, fontFamily: font.label, fontSize: 12 },
  name: { color: color.text, fontFamily: font.body, fontSize: 16, marginTop: space(0.5) },
  dim: { color: color.textDim, fontFamily: font.body, fontSize: 13, marginTop: space(1) },
});
