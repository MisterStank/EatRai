// EatRai — "Fresh Market" visual language.
// Warm paper ground, ink text, one tangerine accent, confident swipe colours.

export const color = {
  paper: "#FBF7F0",
  surface: "#FFFFFF",
  surfaceAlt: "#F1EBDF",
  ink: "#17140F",
  inkSoft: "#6B6358",
  inkFaint: "#9A9084",
  line: "#E8E0D3",
  accent: "#FF5A1F",
  like: "#12B76A",
  likeBright: "#17E07A",
  nope: "#F0442E",
  gold: "#FFC24B",
  onPhoto: "#FFFFFF",
};

export const radius = { card: 26, lg: 18, md: 14, sm: 10, pill: 999 };

export const space = (n: number) => n * 4;

// Font family keys — resolved by useFonts() in App.tsx.
export const font = {
  display: "Bricolage_800ExtraBold",
  displaySemi: "Bricolage_700Bold",
  bodyReg: "Hanken_400Regular",
  body: "Hanken_500Medium",
  bodySemi: "Hanken_600SemiBold",
  bodyBold: "Hanken_700Bold",
};
