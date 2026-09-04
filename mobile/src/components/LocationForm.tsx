import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { geocode } from "../api/client";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";

// LocationForm is the map-free way to pick a search area: a text field that
// geocodes, plus "use my location". Used as the native picker and as the web
// map's fallback when the map fails to load.
export function LocationForm({
  onPick,
  onUseMyLocation,
}: {
  onPick: (coords: { lat: number; lng: number }, label: string) => void;
  onUseMyLocation: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const submit = async () => {
    const query = q.trim();
    if (query.length < 2 || busy) return;
    setBusy(true);
    setErr(false);
    try {
      const r = await geocode(query, { lang });
      onPick({ lat: r.lat, lng: r.lng }, r.label);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.field}>
        <Feather name="search" size={16} color={color.inkFaint} />
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={(v) => {
            setQ(v);
            setErr(false);
          }}
          placeholder={t("searchArea")}
          placeholderTextColor={color.inkFaint}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={submit}
        />
        {busy ? <ActivityIndicator size="small" color={color.inkFaint} /> : null}
      </View>

      {err ? <Text style={styles.err}>{t("noAreaMatch")}</Text> : null}

      <Pressable
        style={[styles.primary, (busy || q.trim().length < 2) && styles.disabled]}
        onPress={submit}
        disabled={busy || q.trim().length < 2}
      >
        <Text style={styles.primaryText}>{t("search")}</Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={onUseMyLocation}>
        <Feather name="navigation" size={15} color={color.ink} />
        <Text style={styles.secondaryText}>{t("useMyLocation")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    backgroundColor: color.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    height: 52,
  },
  // 16px min — anything smaller and iOS Safari zooms the page in on focus.
  input: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.ink, height: "100%" },
  err: { fontFamily: font.bodySemi, fontSize: 13, color: color.nope, marginTop: space(2.5) },
  primary: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space(4),
  },
  primaryText: { fontFamily: font.display, fontSize: 16, color: "#fff" },
  disabled: { opacity: 0.45 },
  secondary: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    marginTop: space(3),
  },
  secondaryText: { fontFamily: font.displaySemi, fontSize: 14.5, color: color.ink },
});
