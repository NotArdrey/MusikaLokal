import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL or Anon Key is missing! Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      "x-client-info": "musika-lokal-web",
    },
  },
  db: {
    schema: "public",
  },
  realtime: {
    timeout: 30000,
  },
});

export const clearSupabaseAuthStorage = () => {
  const projectRef = (() => {
    try {
      return new URL(supabaseUrl).hostname.split(".")[0];
    } catch {
      return "musika-lokal";
    }
  })();
  localStorage.removeItem(`sb-${projectRef}-auth-token`);
};
