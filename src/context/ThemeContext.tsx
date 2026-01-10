import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

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
  background: '#FFFFFF',
  surface: '#F9FAFB',
  text: '#111827',
  textSecondary: '#6B7280',
  secondary: '#6B7280',
  primary: '#169C46',
  primaryLight: '#D4F5E2',
  primaryDark: '#0E6A2F',
  border: '#E5E7EB',
  muted: '#9CA3AF',
  card: '#FFFFFF',
  inputBackground: '#F3F4F6',
  inputBorder: '#D1D5DB',
};

const darkColors: ThemeColors = {
  background: '#0F0F0F',
  surface: '#1A1A1A',
  text: '#FFFFFF',
  textSecondary: '#A1A1AA',
  secondary: '#A1A1AA',
  primary: '#1DB954',
  primaryLight: '#1A472A',
  primaryDark: '#169C46',
  border: '#2D2D2D',
  muted: '#71717A',
  card: '#1F1F1F',
  inputBackground: '#262626',
  inputBorder: '#404040',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>('system');

  useEffect(() => {
    // Load saved theme preference
    AsyncStorage.getItem('theme').then((savedTheme: string | null) => {
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        setThemeState(savedTheme);
      }
    });
  }, []);

  const setTheme = async (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    await AsyncStorage.setItem('theme', newTheme);
  };

  const isDark = theme === 'system' 
    ? systemColorScheme === 'dark' 
    : theme === 'dark';

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, setTheme }}>
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
