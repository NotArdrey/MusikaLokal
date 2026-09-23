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
        sans: ['Manrope_400Regular'],
        medium: ['Manrope_500Medium'],
        semibold: ['Manrope_600SemiBold'],
        bold: ['SpaceGrotesk_700Bold'],
      },
      colors: {
        primary: {
          50: '#F3F1FF',
          100: '#E9E6FF',
          200: '#D4CFFF',
          300: '#B4AAFF',
          400: '#8878FA',
          500: '#5546F4',
          600: '#493BDF',
          700: '#4034C9',
          800: '#352FA3',
          900: '#2E2B81',
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
        accent: {
          50: '#FFF8E8',
          100: '#FFF1CF',
          200: '#FFDF9A',
          300: '#FFCA5C',
          400: '#FFB627',
          500: '#EA9700',
          600: '#C67300',
          700: '#9E5200',
          800: '#7C3E08',
          900: '#66340C',
        },
        // Muted text/icons
        muted: '#808080',
      },
    },
  },
  plugins: [],
}
