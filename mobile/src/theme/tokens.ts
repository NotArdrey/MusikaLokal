export const palette = {
  ink: "#121318",
  inkMuted: "#62646D",
  paper: "#FFFFFF",
  surface: "#FFFFFF",
  violet: "#5546F4",
  violetDark: "#4034C9",
  violetWash: "#ECEAFE",
  mango: "#FFB627",
  mangoWash: "#FFF1CF",
  success: "#168A65",
  successWash: "#DDF4EB",
  danger: "#D84343",
  dangerWash: "#FCE5E5",
  warning: "#B56A00",
  warningWash: "#FFF0D2",
  line: "#DEDDD7",
  field: "#EEEDE8",
  night: "#111218",
  nightSurface: "#1A1B22",
  nightRaised: "#23242D",
  nightLine: "#34353F",
  nightText: "#F8F7F2",
  nightMuted: "#AAAAB3",
} as const;

export const typography = {
  display: "SpaceGrotesk_700Bold",
  title: "SpaceGrotesk_700Bold",
  heading: "SpaceGrotesk_600SemiBold",
  body: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extraBold: "Manrope_800ExtraBold",
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
} as const;

export const radius = {
  control: 8,
  input: 10,
  button: 12,
  card: 14,
  media: 18,
  status: 999,
} as const;

export const iconSize = {
  small: 16,
  regular: 20,
  large: 24,
} as const;
