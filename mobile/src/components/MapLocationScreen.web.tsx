import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { reverseGeocode } from "../api/client";
import { color, font, radius, space } from "../theme/tokens";
import { useT } from "../lib/i18n";
import { useSession } from "../store/session";
import { LocationForm } from "./LocationForm";
import { AreaSearch } from "./AreaSearch";

const MAPLIBRE_VERSION = "4.7.1";
const JS_URL = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const CSS_URL = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const BKK = { lat: 13.7563, lng: 100.5018 };

type Coords = { lat: number; lng: number };

// Load MapLibre GL JS from a CDN once, on demand — keeps it out of the app
// bundle and off the native build.
let maplibrePromise: Promise<any> | null = null;
function loadMapLibre(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).maplibregl) return Promise.resolve((window as any).maplibregl);
  if (maplibrePromise) return maplibrePromise;
  maplibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[data-maplibre]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_URL;
      link.setAttribute("data-maplibre", "");
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = JS_URL;
    script.async = true;
    script.onload = () => resolve((window as any).maplibregl);
    script.onerror = () => {
      maplibrePromise = null;
      reject(new Error("map failed to load"));
    };
    document.head.appendChild(script);
  });
  return maplibrePromise;
}

export function MapLocationScreen({
  visible,
  initial,
  onClose,
  onConfirm,
  onUseMyLocation,
}: {
  visible: boolean;
  initial?: Coords | null;
  onClose: () => void;
  onConfirm: (coords: Coords, label: string) => void;
  onUseMyLocation: () => void;
}) {
  const t = useT();
  const lang = useSession((s) => s.lang);
  const insets = useSafeAreaInsets();

  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const centerRef = useRef<Coords>(initial ?? BKK);
  const revTimer = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [label, setLabel] = useState("");
  const [labelBusy, setLabelBusy] = useState(false);
  const suppressReverse = useRef(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setReady(false);
    setFailed(false);
    centerRef.current = initial ?? BKK;

    loadMapLibre()
      .then((maplibregl) => {
        if (!alive || !containerRef.current) return;
        const start = centerRef.current;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [start.lng, start.lat],
          zoom: 15,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("load", () => {
          if (!alive) return;
          map.resize();
          setReady(true);
          runReverse(start);
        });
        map.on("moveend", () => {
          const c = map.getCenter();
          centerRef.current = { lat: c.lat, lng: c.lng };
          if (suppressReverse.current) {
            suppressReverse.current = false;
            return; // the label came from the picked suggestion — keep it
          }
          scheduleReverse(centerRef.current);
        });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      clearTimeout(revTimer.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const scheduleReverse = (c: Coords) => {
    clearTimeout(revTimer.current);
    setLabelBusy(true);
    revTimer.current = setTimeout(() => runReverse(c), 550);
  };

  const runReverse = async (c: Coords) => {
    setLabelBusy(true);
    try {
      const r = await reverseGeocode(c.lat, c.lng, { lang });
      setLabel(r.label);
    } catch {
      setLabel("");
    } finally {
      setLabelBusy(false);
    }
  };

  const onPickArea = (c: Coords, picked: string) => {
    centerRef.current = c;
    setLabel(picked);
    setLabelBusy(false);
    if (mapRef.current) {
      suppressReverse.current = true;
      mapRef.current.flyTo({ center: [c.lng, c.lat], zoom: 16 });
    }
  };

  const confirm = () => onConfirm(centerRef.current, label || t("pinnedHere"));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {failed ? (
          <View style={[styles.fallback, { paddingTop: insets.top + space(3) }]}>
            <View style={styles.header}>
              <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8}>
                <Feather name="arrow-left" size={20} color={color.ink} />
              </Pressable>
              <Text style={styles.title}>{t("changeLocation")}</Text>
            </View>
            <LocationForm
              onPick={(c, l) => {
                onConfirm(c, l);
                onClose();
              }}
              onUseMyLocation={() => {
                onUseMyLocation();
                onClose();
              }}
            />
          </View>
        ) : (
          <>
            {/* Real DOM node for MapLibre — react-native-web View refs don't
                reliably hand back the underlying element. */}
            {React.createElement("div", {
              ref: containerRef,
              style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
            })}

            <View pointerEvents="none" style={styles.pin}>
              <Feather name="map-pin" size={38} color={color.accent} />
              <View style={styles.pinDot} />
            </View>

            {!ready ? (
              <View style={styles.loading} pointerEvents="none">
                <ActivityIndicator color={color.accent} />
              </View>
            ) : null}

            <View
              style={[
                styles.top,
                {
                  paddingTop: insets.top + space(2),
                  paddingLeft: Math.max(space(4), insets.left + space(2)),
                  paddingRight: Math.max(space(4), insets.right + space(2)),
                },
              ]}
            >
              <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8}>
                <Feather name="arrow-left" size={20} color={color.ink} />
              </Pressable>
              <View style={styles.searchSlot}>
                <AreaSearch onPick={onPickArea} center={centerRef.current} />
              </View>
            </View>

            <View style={[styles.bottom, { paddingBottom: insets.bottom + space(4) }]}>
              <Pressable
                style={styles.myLoc}
                onPress={() => {
                  onUseMyLocation();
                  onClose();
                }}
              >
                <Feather name="navigation" size={14} color={color.ink} />
                <Text style={styles.myLocText}>{t("useMyLocation")}</Text>
              </Pressable>

              <View style={styles.labelRow}>
                <Feather name="map-pin" size={15} color={color.accent} />
                <Text style={styles.labelText} numberOfLines={1}>
                  {labelBusy
                    ? "…"
                    : label
                      ? t("pinnedNear", { area: label })
                      : t("pinnedHere")}
                </Text>
              </View>

              <Pressable style={styles.confirm} onPress={confirm}>
                <Text style={styles.confirmText}>{t("confirmLocation")}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  fallback: { flex: 1, paddingHorizontal: space(5.5) },
  header: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(5) },
  title: { fontFamily: font.display, fontSize: 22, color: color.ink },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space(2.5),
    paddingHorizontal: space(4),
    paddingBottom: space(2),
    zIndex: 20,
    overflow: "visible",
  },
  searchSlot: { flex: 1, overflow: "visible" },
  pin: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(23,20,15,0.35)",
    marginTop: -4,
  },
  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.paper,
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space(5),
    paddingTop: space(4),
    gap: space(3),
    shadowColor: "#17140F",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  myLoc: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.75),
  },
  myLocText: { fontFamily: font.bodySemi, fontSize: 13, color: color.ink },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  labelText: { flex: 1, fontFamily: font.displaySemi, fontSize: 15.5, color: color.ink },
  confirm: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: { fontFamily: font.display, fontSize: 16, color: "#fff" },
});
