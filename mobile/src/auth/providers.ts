import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../store/auth";

// Finishes the web-auth redirect when the app is re-focused.
WebBrowser.maybeCompleteAuthSession();

const googleConfig = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

/**
 * useGoogleSignIn wires expo-auth-session's Google provider. It requests an
 * `id_token` (a signed JWT) which the backend verifies against Google's JWKS —
 * we never see or store a Google access token.
 */
export function useGoogleSignIn() {
  const signInWith = useAuth((s) => s.signInWith);
  const [error, setError] = useState<string | null>(null);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(googleConfig);

  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      const idToken = response.params?.id_token;
      // expo-auth-session puts a nonce in the id_token request; Google echoes
      // it back verbatim in the token, and the backend accepts the raw form.
      const nonce = (request as any)?.nonce as string | undefined;
      if (idToken) {
        signInWith("google", idToken, { nonce }).catch((e) => setError(e.message));
      } else {
        setError("Google did not return an id_token");
      }
    } else if (response.type === "error") {
      setError(response.error?.message ?? "Google sign-in failed");
    }
  }, [response, request, signInWith]);

  return {
    ready: !!request,
    error,
    signIn: () => {
      setError(null);
      return promptAsync();
    },
  };
}

/** appleAvailable resolves true only on iOS 13+ with Sign in with Apple enabled. */
export async function appleAvailable() {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync());
}

/**
 * signInWithApple runs the native Apple flow. It uses the Firebase-style nonce
 * dance: send SHA-256(rawNonce) to Apple, send the *raw* nonce to our backend,
 * which re-hashes and compares against the token's `nonce` claim.
 */
export async function signInWithApple() {
  const rawNonce = randomNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!cred.identityToken) throw new Error("Apple did not return an identity token");

  // Apple only sends the name on the very first authorization — forward it now.
  const fullName = [cred.fullName?.givenName, cred.fullName?.familyName]
    .filter(Boolean)
    .join(" ");

  await useAuth.getState().signInWith("apple", cred.identityToken, {
    nonce: rawNonce,
    fullName: fullName || undefined,
  });
}

function randomNonce(bytes = 16) {
  const raw = Crypto.getRandomBytes(bytes);
  return Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("");
}
