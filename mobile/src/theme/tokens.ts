import { Platform } from "react-native";

// EatRai visual tokens — warm charcoal ground, chili-red brand, lime "yes".
// Deliberately not the generic cream + terracotta look.
export const color = {
  bg: "#161311",
  surface: "#211C18",
  surfaceAlt: "#2C2521",
  line: "#38302A",
  text: "#F5EFEA",
  textDim: "#A79E96",
  primary: "#E23A2E", // chili red — brand / pass
  yes: "#7BC043", // lime — like
  gold: "#F2B441", // superlike / ratings / streak
  stretch: "#7C6BF0", // violet — the "stretch" pick
};

export const radius = { card: 26, pill: 999, sm: 10 };
export const space = (n: number) => n * 4;

// System fonts keep the skeleton runnable with zero font setup. Swap in
// Fraunces (display) + Inter (body) via expo-font when you wire real assets.
export const font = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  body: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  label: Platform.select({ ios: "System", android: "sans-serif-medium", default: "System" }),
};
