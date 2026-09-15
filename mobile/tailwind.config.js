/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins_400Regular'],
        medium: ['Poppins_500Medium'],
        semibold: ['Poppins_600SemiBold'],
        bold: ['Poppins_700Bold'],
      },
      colors: {
        // Primary - Dark Spotify Green
        primary: {
          50: '#D4F5E2',
          100: '#A8EBC5',
          200: '#7DE1A8',
          300: '#52D78B',
          400: '#27CD6E',
          500: '#169C46',  // Darker Spotify Green
          600: '#12833A',
          700: '#0E6A2F',
          800: '#0A5123',
          900: '#063818',
        },
        // Secondary - Spotify Dark
        secondary: {
          50: '#E8E8E8',
          100: '#CCCCCC',
          200: '#999999',
          300: '#666666',
          400: '#404040',
          500: '#1A1A1A',  // Dark Gray
          600: '#151515',
          700: '#101010',
          800: '#0A0A0A',
          900: '#050505',
        },
        // Accent - Dark Gray
        accent: {
          50: '#E0E0E0',
          100: '#C4C4C4',
          200: '#A8A8A8',
          300: '#808080',
          400: '#606060',
          500: '#404040',
          600: '#333333',
          700: '#262626',
          800: '#1A1A1A',
          900: '#0D0D0D',
        },
        // Muted text/icons
        muted: '#808080',
      },
    },
  },
  plugins: [],
}
