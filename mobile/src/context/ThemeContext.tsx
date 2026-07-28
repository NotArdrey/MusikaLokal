import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
}

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeMode) => void;
}

const lightColors: ThemeColors = {
  background: '#F9FAFB', // modern gray-50
  surface: '#FFFFFF',
  text: '#111827', // gray-900
  textSecondary: '#6B7280', // gray-500
  secondary: '#6B7280',
  primary: '#4F46E5', // Indigo 600
  primaryLight: '#E0E7FF', // Indigo 100
  primaryDark: '#4338CA', // Indigo 700
  border: '#E5E7EB', // gray-200
  muted: '#9CA3AF',
  card: '#FFFFFF',
  inputBackground: '#F3F4F6',
  inputBorder: '#D1D5DB',
};

const darkColors: ThemeColors = {
  background: '#0F172A', // Slate 900
  surface: '#1E293B', // Slate 800
  text: '#F8FAFC', // Slate 50
  textSecondary: '#94A3B8', // Slate 400
  secondary: '#94A3B8',
  primary: '#6366F1', // Indigo 500
  primaryLight: '#312E81', // Indigo 900
  primaryDark: '#4F46E5', // Indigo 600
  border: '#334155', // Slate 700
  muted: '#64748B',
  card: '#1E293B', // Slate 800
  inputBackground: '#1E293B',
  inputBorder: '#475569',
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
