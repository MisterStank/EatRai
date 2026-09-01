import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { SwipeCard } from "../components/SwipeCard";
import { MatchModal } from "../components/MatchModal";
import { getDeck, swipe, type Card, type Direction } from "../api/client";
import { useAuth } from "../store/auth";
import { color, font, radius, space } from "../theme/tokens";

export function DeckScreen() {
  const refreshMe = useAuth((s) => s.refreshMe);
  const [cards, setCards] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [match, setMatch] = useState<Card | null>(null);
  const loc = useRef<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    try {
      if (!loc.current) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setErr("Location permission is needed to find restaurants near you.");
          setLoading(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        loc.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
      const deck = await getDeck(loc.current.lat, loc.current.lng);
      setCards(deck);
      setI(0);
      setErr(deck.length === 0 ? "No new spots nearby — widen your radius in Palate." : null);
    } catch (e: any) {
      setErr(e.message ?? "Could not load the deck.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onResolve = (card: Card) => async (dir: Direction) => {
    setI((n) => {
      const next = n + 1;
      if (next >= cards.length - 3) load();
      return next;
    });
    try {
      const res = await swipe(card.id, dir, { wasStretch: card.isStretch });
      if (res.match) setMatch(res.match);
      if (typeof res.adventureStreak === "number") refreshMe();
    } catch {
      /* swipe is best-effort; deck already advanced */
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.primary} />
      </View>
    );

  const visible = cards.slice(i, i + 3).reverse();

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>กินไร?</Text>

      <View style={styles.deck}>
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{err ?? "That's everything nearby for now."}</Text>
            <Pressable style={styles.retry} onPress={load}>
              <Text style={styles.retryText}>Reload</Text>
            </Pressable>
          </View>
        ) : (
          visible.map((card, idx) => (
            <SwipeCard
              key={card.id}
              card={card}
              isTop={idx === visible.length - 1}
              onResolve={onResolve(card)}
            />
          ))
        )}
      </View>

      <MatchModal match={match} onClose={() => setMatch(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg, paddingTop: space(15) },
  h: { color: color.text, fontFamily: font.display, fontSize: 30, textAlign: "center" },
  deck: { flex: 1, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center" },
  empty: { padding: space(8), alignItems: "center" },
  emptyText: { color: color.textDim, fontFamily: font.body, textAlign: "center" },
  retry: {
    marginTop: space(4),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space(6),
    paddingVertical: space(2.5),
  },
  retryText: { color: color.text, fontFamily: font.label },
});
