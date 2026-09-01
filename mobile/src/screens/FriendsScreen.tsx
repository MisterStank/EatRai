import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  acceptFriend,
  addFriend,
  getCompatibility,
  listFriends,
  type Compatibility,
  type Friend,
} from "../api/client";
import { color, font, radius, space } from "../theme/tokens";

export function FriendsScreen() {
  const nav = useNavigation<any>();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [handle, setHandle] = useState("");
  const [detail, setDetail] = useState<Record<string, Compatibility>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setFriends(await listFriends());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!handle.trim()) return;
    try {
      const { sentTo } = await addFriend(handle.trim());
      Alert.alert("Request sent", `We let @${sentTo} know.`);
      setHandle("");
      load();
    } catch (e: any) {
      Alert.alert("Couldn't send", e.message);
    }
  };

  const accepted = friends.filter((f) => f.status === "accepted");

  const expand = async (f: Friend) => {
    if (detail[f.id]) {
      setDetail((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== f.id)));
      return;
    }
    try {
      const c = await getCompatibility(f.id);
      setDetail((d) => ({ ...d, [f.id]: c }));
    } catch {
      /* leave collapsed */
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>Taste match</Text>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="add by @handle"
          placeholderTextColor={color.textDim}
          autoCapitalize="none"
          value={handle}
          onChangeText={setHandle}
          onSubmitEditing={send}
        />
        <Pressable style={styles.addBtn} onPress={send}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {accepted.length > 0 && (
        <Pressable
          style={styles.consensusCta}
          onPress={() => nav.navigate("Consensus", { friends: accepted })}
        >
          <Text style={styles.consensusText}>Find where you'd all agree →</Text>
        </Pressable>
      )}

      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={color.textDim} />}
        ListEmptyComponent={<Text style={styles.dim}>Add friends to compare palates.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              style={styles.rowMain}
              onPress={() => item.status === "accepted" && expand(item)}
            >
              <View>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.dim}>@{item.handle}</Text>
              </View>

              {item.status === "pending" ? (
                item.incoming ? (
                  <Pressable
                    style={styles.accept}
                    onPress={async () => {
                      await acceptFriend(item.id);
                      load();
                    }}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.dim}>pending</Text>
                )
              ) : (
                <Text style={styles.score}>{Math.round(item.compatibility)}%</Text>
              )}
            </Pressable>

            {detail[item.id] && (
              <View style={styles.detail}>
                <Text style={styles.detailLine}>
                  {detail[item.id].basis === "shared-history"
                    ? `From ${detail[item.id].overlap} places you've both swiped`
                    : detail[item.id].basis === "blended"
                      ? "From your tastes + early shared swipes"
                      : "Estimated from your taste profiles"}
                </Text>
                {detail[item.id].bothLove.length > 0 && (
                  <Text style={styles.both}>Both love: {detail[item.id].bothLove.join(", ")}</Text>
                )}
                {detail[item.id].neitherLikes.length > 0 && (
                  <Text style={styles.clash}>
                    You clash on: {detail[item.id].neitherLikes.join(", ")}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg, paddingTop: space(15), paddingHorizontal: space(5) },
  h: { color: color.text, fontFamily: font.display, fontSize: 26, marginBottom: space(4) },
  addRow: { flexDirection: "row", gap: space(2), marginBottom: space(4) },
  input: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    color: color.text,
    fontFamily: font.body,
  },
  addBtn: { backgroundColor: color.primary, borderRadius: radius.sm, paddingHorizontal: space(4), justifyContent: "center" },
  addBtnText: { color: color.text, fontFamily: font.label, fontWeight: "700" },
  consensusCta: {
    backgroundColor: color.surfaceAlt,
    borderRadius: radius.sm,
    padding: space(3.5),
    marginBottom: space(4),
  },
  consensusText: { color: color.gold, fontFamily: font.label },
  row: { borderBottomColor: color.line, borderBottomWidth: 1, paddingVertical: space(3.5) },
  rowMain: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: color.text, fontFamily: font.body, fontSize: 16 },
  dim: { color: color.textDim, fontFamily: font.body, fontSize: 13 },
  score: { color: color.gold, fontFamily: font.label, fontWeight: "700", fontSize: 18 },
  accept: { backgroundColor: color.yes, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(1.5) },
  acceptText: { color: color.bg, fontFamily: font.label, fontWeight: "700" },
  detail: { marginTop: space(3), gap: space(1) },
  detailLine: { color: color.textDim, fontFamily: font.body, fontSize: 13 },
  both: { color: color.yes, fontFamily: font.body, fontSize: 13 },
  clash: { color: color.primary, fontFamily: font.body, fontSize: 13 },
});
