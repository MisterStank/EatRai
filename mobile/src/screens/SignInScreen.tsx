import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../store/auth";
import { appleAvailable, signInWithApple, useGoogleSignIn } from "../auth/providers";
import { color, font, radius, space } from "../theme/tokens";

export function SignInScreen() {
  const devSignIn = useAuth((s) => s.devSignIn);
  const google = useGoogleSignIn();
  const [showApple, setShowApple] = useState(false);
  const [busy, setBusy] = useState<null | "apple" | "google">(null);

  useEffect(() => {
    appleAvailable().then(setShowApple);
  }, []);

  useEffect(() => {
    if (google.error) {
      Alert.alert("Google sign-in", google.error);
      setBusy(null);
    }
  }, [google.error]);

  const doApple = async () => {
    setBusy("apple");
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") Alert.alert("Apple sign-in", e.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  const doGoogle = async () => {
    setBusy("google");
    await google.signIn(); // result handled in the hook's effect
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.logo}>กินไร?</Text>
      <Text style={styles.tag}>Swipe the restaurants around you.{"\n"}We learn the rest.</Text>

      {showApple && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.pill}
          style={styles.appleBtn}
          onPress={doApple}
        />
      )}

      <Pressable
        style={[styles.btn, styles.google]}
        disabled={!google.ready || busy !== null}
        onPress={doGoogle}
      >
        {busy === "google" ? (
          <ActivityIndicator color={color.text} />
        ) : (
          <Text style={styles.btnTextDark}>Continue with Google</Text>
        )}
      </Pressable>

      {Platform.OS === "android" && !showApple && (
        <Text style={styles.note}>Sign in with Apple isn't available on this device.</Text>
      )}

      {__DEV__ && (
        <Pressable
          style={styles.dev}
          onPress={() =>
            devSignIn("tester" + Math.floor(Math.random() * 1000)).catch((e) =>
              Alert.alert("Dev sign-in", e.message),
            )
          }
        >
          <Text style={styles.devText}>dev: skip sign-in</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center", padding: space(8) },
  logo: { color: color.text, fontFamily: font.display, fontSize: 44 },
  tag: { color: color.textDim, fontFamily: font.body, textAlign: "center", marginTop: space(3), marginBottom: space(12), lineHeight: 22 },
  appleBtn: { width: "100%", height: 52, marginTop: space(3) },
  btn: { width: "100%", borderRadius: radius.pill, paddingVertical: space(4), alignItems: "center", marginTop: space(3), minHeight: 52, justifyContent: "center" },
  google: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  btnTextDark: { color: color.text, fontFamily: font.label, fontWeight: "700", fontSize: 16 },
  note: { color: color.textDim, fontFamily: font.body, fontSize: 12, marginTop: space(4), textAlign: "center" },
  dev: { marginTop: space(6) },
  devText: { color: color.textDim, fontFamily: font.body, textDecorationLine: "underline" },
});
