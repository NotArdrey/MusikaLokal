// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'scripts/**',
      'supabase/.temp/**',
      'supabase/functions/**',
      'test-results/**',
    ],
  },
]);
