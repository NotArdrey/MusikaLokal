import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { palette } from '../theme/tokens';

type ThemeMode = 'light' | 'dark' | 'system';

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
  accent: string;
  success: string;
  danger: string;
  warning: string;
}

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeMode) => void;
}

const lightColors: ThemeColors = {
  background: palette.paper,
  surface: palette.surface,
  text: palette.ink,
  textSecondary: palette.inkMuted,
  secondary: palette.inkMuted,
  primary: palette.violet,
  primaryLight: palette.violetWash,
  primaryDark: palette.violetDark,
  border: palette.line,
  muted: '#969790',
  card: palette.surface,
  inputBackground: palette.field,
  inputBorder: '#D3D2CB',
  accent: palette.mango,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,
};

const darkColors: ThemeColors = {
  background: palette.night,
  surface: palette.nightSurface,
  text: palette.nightText,
  textSecondary: palette.nightMuted,
  secondary: palette.nightMuted,
  primary: '#776AF7',
  primaryLight: '#2B2854',
  primaryDark: '#9389FF',
  border: palette.nightLine,
  muted: '#777984',
  card: palette.nightSurface,
  inputBackground: palette.nightRaised,
  inputBorder: '#464751',
  accent: palette.mango,
  success: '#3BC596',
  danger: '#F16A6A',
  warning: '#F0B04C',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    // Load saved theme preference
    AsyncStorage.getItem('theme').then((savedTheme: string | null) => {
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        setThemeState(savedTheme);
      }
    });
  }, []);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    await AsyncStorage.setItem('theme', newTheme);
  }, []);

  const isDark = theme !== 'light';

  const colors = isDark ? darkColors : lightColors;
  const contextValue = useMemo<ThemeContextType>(() => ({
    theme,
    isDark,
    colors,
    setTheme,
  }), [colors, isDark, setTheme, theme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
