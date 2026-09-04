import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { geocode, suggest, type Suggestion } from "../api/client";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { useSession, type RecentArea } from "../store/session";
import { newSessionToken } from "../lib/uuid";

type Coords = { lat: number; lng: number };

// AreaSearch is the shared location-search field: debounced autocomplete,
// recent picks when empty, free-text fallback on submit. Used by the web map's
// top bar and by the map-free LocationForm.
export function AreaSearch({
  onPick,
  center,
  autoFocus,
}: {
  onPick: (coords: Coords, label: string) => void;
  center?: Coords | null;
  autoFocus?: boolean;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const recents = useSession((s) => s.recentAreas);

  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);

  const tokenRef = useRef(newSessionToken());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (debounce.current) clearTimeout(debounce.current);
    ctrlRef.current?.abort();
    if (query.length < 2) {
      setItems([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    debounce.current = setTimeout(async () => {
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const r = await suggest(query, {
        token: tokenRef.current,
        lat: center?.lat,
        lng: center?.lng,
        lang,
        signal: ctrl.signal,
      }).catch(() => [] as Suggestion[]);
      if (!ctrl.signal.aborted) {
        setItems(r);
        setBusy(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      ctrlRef.current?.abort();
    };
  }, [q, lang, center?.lat, center?.lng]);

  const reset = () => {
    setQ("");
    setItems([]);
    tokenRef.current = newSessionToken();
  };

  const pickSuggestion = async (s: Suggestion) => {
    setBusy(true);
    try {
      const r = await geocode("", { placeId: s.placeId, token: tokenRef.current, lang });
      onPick({ lat: r.lat, lng: r.lng }, r.label || s.primaryText);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      reset();
    }
  };

  const submitFreeText = async () => {
    const query = q.trim();
    if (query.length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await geocode(query, { lang });
      onPick({ lat: r.lat, lng: r.lng }, r.label);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      reset();
    }
  };

  const showRecents = focused && q.trim().length === 0 && recents.length > 0;
  const showItems = q.trim().length >= 2 && (items.length > 0 || busy);

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Feather name="search" size={16} color={color.inkFaint} />
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={t("searchArea")}
          placeholderTextColor={color.inkFaint}
          autoFocus={autoFocus}
          returnKeyType="search"
          onSubmitEditing={submitFreeText}
        />
        {busy ? (
          <ActivityIndicator size="small" color={color.inkFaint} />
        ) : q.length > 0 ? (
          <Pressable onPress={reset} hitSlop={8}>
            <Feather name="x" size={15} color={color.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      {showRecents || showItems ? (
        <View style={styles.list}>
          {showRecents && (
            <Text style={styles.listHeader}>{t("recentSearches")}</Text>
          )}
          {showRecents
            ? recents.map((a: RecentArea) => (
                <Pressable key={a.label} style={styles.row} onPress={() => onPick({ lat: a.lat, lng: a.lng }, a.label)}>
                  <Feather name="clock" size={15} color={color.inkFaint} />
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              ))
            : items.map((s) => (
                <Pressable key={s.placeId} style={styles.row} onPress={() => pickSuggestion(s)}>
                  <Feather name="map-pin" size={15} color={color.inkFaint} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowPrimary} numberOfLines={1}>
                      {s.primaryText}
                    </Text>
                    {s.secondaryText ? (
                      <Text style={styles.rowSecondary} numberOfLines={1}>
                        {s.secondaryText}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", position: "relative", zIndex: 20 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    height: 48,
    shadowColor: "#17140F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  // 16px min — anything smaller and iOS Safari zooms the page in on focus.
  input: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.ink, height: "100%" },
  list: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingVertical: space(1.5),
    shadowColor: "#17140F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  listHeader: {
    fontFamily: font.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: color.inkFaint,
    paddingHorizontal: space(3.5),
    paddingTop: space(1.5),
    paddingBottom: space(1),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(3.5),
    paddingVertical: space(2.75),
  },
  rowText: { flex: 1 },
  rowPrimary: { fontFamily: font.bodySemi, fontSize: 14.5, color: color.ink },
  rowSecondary: { fontFamily: font.body, fontSize: 12.5, color: color.inkSoft, marginTop: space(0.5) },
});
