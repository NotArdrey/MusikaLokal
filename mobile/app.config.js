/* global __dirname */

const { resolve } = require("path");

const defaultEnvPath = resolve(__dirname, "..", ".env");
const e2eEnvPath = process.env.E2E_ENV_FILE || resolve(__dirname, "..", ".env.e2e");
const shouldUseE2EEnv =
  process.env.EXPO_PUBLIC_E2E === "1" ||
  process.env.E2E === "1" ||
  Boolean(process.env.E2E_ENV_FILE);

require("dotenv").config({
  path: shouldUseE2EEnv ? e2eEnvPath : defaultEnvPath,
  override: true,
  quiet: true,
});

const appJson = require("./app.json");

const expoConfig = appJson.expo || {};

const sanitize = (value) => (typeof value === "string" ? value.trim() : "");

const readEnv = (name, fallback = "") => sanitize(process.env[name]) || fallback;
const readPublicOrE2EEnv = (publicName, e2eName, fallback = "") =>
  readEnv(publicName, readEnv(e2eName, fallback));

module.exports = () => {
  const existingExtra = expoConfig.extra || {};

  return {
    ...expoConfig,
    extra: {
      ...existingExtra,
      supabaseUrl: readPublicOrE2EEnv(
        "EXPO_PUBLIC_SUPABASE_URL",
        "E2E_SUPABASE_URL",
        sanitize(existingExtra.supabaseUrl),
      ),
      supabaseAnonKey: readPublicOrE2EEnv(
        "EXPO_PUBLIC_SUPABASE_ANON_KEY",
        "E2E_SUPABASE_ANON_KEY",
        sanitize(existingExtra.supabaseAnonKey),
      ),
      e2eMode: readEnv("EXPO_PUBLIC_E2E", sanitize(existingExtra.e2eMode)),
      groqApiKey: readEnv(
        "EXPO_PUBLIC_GROQ_API_KEY",
        sanitize(existingExtra.groqApiKey),
      ),
    },
  };
};
