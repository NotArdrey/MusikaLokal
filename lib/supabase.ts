import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL or Anon Key is missing! Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.');
}

// Custom storage adapter that works on both web and native
const ExpoSecureStorage = {
    getItem: async (key: string) => {
        if (Platform.OS === 'web') {
            return localStorage.getItem(key);
        }
        return AsyncStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
        if (Platform.OS === 'web') {
            localStorage.setItem(key, value);
            return;
        }
        return AsyncStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
        if (Platform.OS === 'web') {
            localStorage.removeItem(key);
            return;
        }
        return AsyncStorage.removeItem(key);
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ExpoSecureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
    },
    global: {
        headers: {
            'x-client-info': 'musika-lokal',
        },
    },
    db: {
        schema: 'public',
    },
    realtime: {
        timeout: 30000,
    },
});

// Monkey-patch functions.invoke for React Native/Hermes compatibility
// Workaround for @supabase/functions-js custom Error class instantiation issues
// See: https://github.com/supabase/functions-js/issues/16
const originalInvoke = supabase.functions.invoke.bind(supabase.functions) as any;
(supabase.functions as any).invoke = async function<T = any>(
    functionName: string,
    options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
    try {
        const result = (await originalInvoke(functionName, options)) as {
            data: T | null;
            error: { message?: string } | null;
        };
        if (result.error) {
            // Convert FunctionsError to plain Error for Hermes compatibility
            return { data: null, error: new Error(result.error.message || 'Function invocation failed') };
        }
        return { data: result.data ?? null, error: null };
    } catch (err) {
        // Catch any instantiation errors from functions-js error classes
        const message = err instanceof Error ? err.message : 'Unknown error invoking function';
        return { data: null, error: new Error(message) };
    }
};
