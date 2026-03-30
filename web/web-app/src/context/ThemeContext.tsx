import React, { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  secondary: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  border: string;
  muted: string;
  card: string;
  inputBackground: string;
  inputBorder: string;
}

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeMode) => void;
}

const lightColors: ThemeColors = {
  background: "#F9FAFB",
  surface: "#FFFFFF",
  text: "#111827",
  textSecondary: "#6B7280",
  secondary: "#6B7280",
  primary: "#4F46E5",
  primaryLight: "#E0E7FF",
  primaryDark: "#4338CA",
  border: "#E5E7EB",
  muted: "#9CA3AF",
  card: "#FFFFFF",
  inputBackground: "#F3F4F6",
  inputBorder: "#D1D5DB",
};

const darkColors: ThemeColors = {
  background: "#0F172A",
  surface: "#1E293B",
  text: "#F8FAFC",
  textSecondary: "#94A3B8",
  secondary: "#94A3B8",
  primary: "#6366F1",
  primaryLight: "#312E81",
  primaryDark: "#4F46E5",
  border: "#334155",
  muted: "#64748B",
  card: "#1E293B",
  inputBackground: "#1E293B",
  inputBorder: "#475569",
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemPreference(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark" || saved === "system")
      return saved;
    return "system";
  });

  const [systemDark, setSystemDark] = useState(getSystemPreference);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isDark = theme === "system" ? systemDark : theme === "dark";
  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
