/* global __dirname */

const { resolve } = require("path");

require("dotenv").config({
  path: resolve(__dirname, "..", ".env"),
  override: true,
  quiet: true,
});

const appJson = require("./app.json");

const expoConfig = appJson.expo || {};

const sanitize = (value) => (typeof value === "string" ? value.trim() : "");

const readEnv = (name, fallback = "") => sanitize(process.env[name]) || fallback;

module.exports = () => {
  const existingExtra = expoConfig.extra || {};

  return {
    ...expoConfig,
    extra: {
      ...existingExtra,
      supabaseUrl: readEnv(
        "EXPO_PUBLIC_SUPABASE_URL",
        sanitize(existingExtra.supabaseUrl),
      ),
      supabaseAnonKey: readEnv(
        "EXPO_PUBLIC_SUPABASE_ANON_KEY",
        sanitize(existingExtra.supabaseAnonKey),
      ),
      groqApiKey: readEnv(
        "EXPO_PUBLIC_GROQ_API_KEY",
        sanitize(existingExtra.groqApiKey),
      ),
    },
  };
};
