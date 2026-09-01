import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme/tokens";
import type { Card } from "../api/client";

export function MatchModal({ match, onClose }: { match: Card | null; onClose: () => void }) {
  return (
    <Modal visible={!!match} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.kicker}>IT'S A MATCH</Text>
          <Text style={styles.name}>{match?.name}</Text>
          <Text style={styles.sub}>
            {match?.address || "Everyone in your group swiped right."}
          </Text>
          <Pressable style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Lock it in</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: space(6) },
  sheet: { backgroundColor: color.surface, borderRadius: radius.card, padding: space(6), width: "100%", alignItems: "center" },
  kicker: { color: color.primary, fontFamily: font.label, letterSpacing: 2, fontSize: 13 },
  name: { color: color.text, fontFamily: font.display, fontSize: 28, marginTop: space(2), textAlign: "center" },
  sub: { color: color.textDim, fontFamily: font.body, marginTop: space(2), textAlign: "center" },
  btn: { backgroundColor: color.primary, borderRadius: radius.pill, paddingHorizontal: space(8), paddingVertical: space(3.5), marginTop: space(5) },
  btnText: { color: color.text, fontFamily: font.label, fontWeight: "700", fontSize: 16 },
});
