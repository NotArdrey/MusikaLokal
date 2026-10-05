import { typography } from "./tokens";

export const managementCardStyles = {
  surface: { borderWidth: 1, borderRadius: 16, padding: 16 },
  identity: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  thumbnail: { width: 64, height: 64, borderRadius: 10 },
  title: { fontFamily: typography.heading, fontSize: 18, lineHeight: 24 },
  metadata: { fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  label: {
    fontFamily: typography.semibold,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  body: { fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  button: {
    minHeight: 44,
    borderRadius: 9,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  attachment: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
} as const;
