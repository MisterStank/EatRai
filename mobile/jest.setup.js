import "react-native-gesture-handler/jestSetup";

import { useSession } from "./src/store/session";

// jsdom (used by the web-only AdCard test) has no matchMedia; the
// react-native-reanimated mock touches it at load. Harmless in the default RN
// test environment, where `window` is undefined.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// The app default language is Thai (see session store). Component tests assert
// against the English UI strings, so pin the language to "en" for tests. This
// file is a `setupFiles` entry (runs once per test file, before the test
// framework), so set it directly rather than in a `beforeEach`. Tests that
// exercise Thai can still call useSession.setState({ lang: "th" }).
useSession.setState({ lang: "en" });

// The real native view manager backing SafeAreaProvider/SafeAreaView doesn't
// exist in the test renderer — without this mock, SafeAreaProvider silently
// renders no children at all instead of erroring, which looks like "nothing
// rendered" rather than a clear failure.
jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default ?? mock; // the .tsx mock is ESM-default-exported
});

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  // The official mock doesn't implement every hook we use — patch the gaps.
  Reanimated.useReducedMotion = () => false;
  return Reanimated;
});

// expo-font's native font loading has nothing to check in a jest/jsdom
// environment — treat fonts as always loaded so components that gate on
// useFonts() render immediately.
jest.mock("expo-font", () => ({
  ...jest.requireActual("expo-font"),
  useFonts: () => [true],
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: () => true,
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({ coords: { latitude: 13.7563, longitude: 100.5018 } }),
  ),
  reverseGeocodeAsync: jest.fn(() => Promise.resolve([])),
  Accuracy: { High: 4 },
}));
