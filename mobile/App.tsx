import "react-native-gesture-handler";
import React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Kanit_600SemiBold, Kanit_700Bold } from "@expo-google-fonts/kanit";
import {
  Anuphan_400Regular,
  Anuphan_500Medium,
  Anuphan_600SemiBold,
  Anuphan_700Bold,
} from "@expo-google-fonts/anuphan";

import { DeckScreen } from "./src/screens/DeckScreen";
import { SharedListScreen } from "./src/screens/SharedListScreen";
import { parseSharedList } from "./src/lib/sharing";
import { color } from "./src/theme/tokens";

export default function App() {
  const [loaded] = useFonts({
    Kanit_600SemiBold,
    Kanit_700Bold,
    Anuphan_400Regular,
    Anuphan_500Medium,
    Anuphan_600SemiBold,
    Anuphan_700Bold,
  });

  const shared = parseSharedList();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.paper }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {!loaded ? (
          <View style={{ flex: 1, backgroundColor: color.paper }} />
        ) : shared ? (
          <SharedListScreen ids={shared.ids} />
        ) : (
          <DeckScreen />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
