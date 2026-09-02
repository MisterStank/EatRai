import "react-native-gesture-handler";
import React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";

import { DeckScreen } from "./src/screens/DeckScreen";
import { color } from "./src/theme/tokens";

export default function App() {
  const [loaded] = useFonts({
    Bricolage_700Bold: BricolageGrotesque_700Bold,
    Bricolage_800ExtraBold: BricolageGrotesque_800ExtraBold,
    Hanken_400Regular: HankenGrotesk_400Regular,
    Hanken_500Medium: HankenGrotesk_500Medium,
    Hanken_600SemiBold: HankenGrotesk_600SemiBold,
    Hanken_700Bold: HankenGrotesk_700Bold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.paper }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {loaded ? <DeckScreen /> : <View style={{ flex: 1, backgroundColor: color.paper }} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
