import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { DeckScreen } from "./src/screens/DeckScreen";
import { FriendsScreen } from "./src/screens/FriendsScreen";
import { PalateScreen } from "./src/screens/PalateScreen";
import { ConsensusScreen } from "./src/screens/ConsensusScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { useAuth } from "./src/store/auth";
import { color } from "./src/theme/tokens";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: color.bg,
    card: color.surface,
    text: color.text,
    border: color.line,
    primary: color.primary,
  },
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.primary,
        tabBarInactiveTintColor: color.textDim,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.line },
      }}
    >
      <Tab.Screen name="Discover" component={DeckScreen} />
      <Tab.Screen name="Friends" component={FriendsStack} />
      <Tab.Screen name="Palate" component={PalateScreen} />
    </Tab.Navigator>
  );
}

function FriendsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FriendsHome" component={FriendsScreen} />
      <Stack.Screen name="Consensus" component={ConsensusScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const { status, bootstrap } = useAuth();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme}>
        {status === "loading" ? (
          <View style={{ flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={color.primary} />
          </View>
        ) : status === "signedIn" ? (
          <Tabs />
        ) : (
          <SignInScreen />
        )}
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
