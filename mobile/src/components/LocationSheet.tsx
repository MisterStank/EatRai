import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { geocode } from "../api/client";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";

export function LocationSheet({
  visible,
  onClose,
  onPick,
  onUseMyLocation,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (coords: { lat: number; lng: number }, label: string) => void;
  onUseMyLocation: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (visible) {
      setQ("");
      setErr(false);
      setBusy(false);
    }
  }, [visible]);

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{t("changeLocation")}</Text>

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
        </View>

        {err ? <Text style={styles.err}>{t("noAreaMatch")}</Text> : null}

        <Pressable
          style={[styles.primary, (busy || q.trim().length < 2) && styles.disabled]}
          onPress={submit}
          disabled={busy || q.trim().length < 2}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>{t("search")}</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.secondary}
          onPress={() => {
            onUseMyLocation();
            onClose();
          }}
        >
          <Feather name="navigation" size={15} color={color.ink} />
          <Text style={styles.secondaryText}>{t("useMyLocation")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,13,6,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space(5.5),
    paddingTop: space(3.5),
    paddingBottom: space(8),
  },
  grabber: { width: 40, height: 4, borderRadius: 999, backgroundColor: "#DDD3C2", alignSelf: "center" },
  title: { fontFamily: font.display, fontSize: 22, color: color.ink, marginTop: space(4), marginBottom: space(4) },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    backgroundColor: color.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    height: 52,
  },
  input: { flex: 1, fontFamily: font.body, fontSize: 15, color: color.ink, height: "100%" },
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
