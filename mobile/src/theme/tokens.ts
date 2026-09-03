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

// Kanit (display) + Anuphan (body) — both cover Thai + Latin in one family, so
// text holds up when the UI language switches. Resolved by useFonts() in App.tsx.
export const font = {
  display: "Kanit_700Bold",
  displaySemi: "Kanit_600SemiBold",
  bodyReg: "Anuphan_400Regular",
  body: "Anuphan_500Medium",
  bodySemi: "Anuphan_600SemiBold",
  bodyBold: "Anuphan_700Bold",
};
