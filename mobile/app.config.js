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
      geminiApiKey: readEnv(
        "EXPO_PUBLIC_GEMINI_API_KEY",
        sanitize(existingExtra.geminiApiKey),
      ),
      geminiModel: readEnv(
        "EXPO_PUBLIC_GEMINI_MODEL",
        sanitize(existingExtra.geminiModel) || "gemini-2.5-flash-lite",
      ),
    },
  };
};