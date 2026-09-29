import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { supabase } from "../lib/supabase";
import AuthMusicHero from "../src/components/AuthMusicHero";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const normalizeRole = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export default function AdminLoginScreen() {
  const { colors, isDark } = useTheme();
  const { session, loading: authLoading, roleResolved, isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const showHero = Platform.OS === "web" && width >= 900;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session && roleResolved && isAdmin) {
      router.replace("/admin");
    }
  }, [authLoading, isAdmin, roleResolved, session]);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setErrorMessage("Enter your admin email and password.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await supabase.auth.signOut({ scope: "local" });
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        setErrorMessage(
          error?.message === "Invalid login credentials"
            ? "Invalid email or password."
            : error?.message || "Unable to sign in.",
        );
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = normalizeRole(profile?.role || data.user.app_metadata?.role);
      if (profileError || role !== "admin") {
        await supabase.auth.signOut({ scope: "local" });
        setErrorMessage("This portal is restricted to administrator accounts.");
        return;
      }

      router.replace("/admin");
    } catch {
      setErrorMessage("Unable to sign in right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      {showHero ? (
        <View style={styles.heroColumn}>
          <AuthMusicHero
            title="Manage Musika Lokal"
            subtitle="A secure workspace for platform administrators."
          />
        </View>
      ) : null}

      <View style={styles.formColumn}>
        <View style={styles.formShell}>
          <Image
            source={
              isDark
                ? require("../assets/images/musika-lokal-logo-modern-wordmark-dark.png")
                : require("../assets/images/musika-lokal-logo-modern-wordmark.png")
            }
            resizeMode="contain"
            style={styles.logo}
          />

          <Text style={[styles.eyebrow, { color: colors.primary }]}>ADMIN PORTAL</Text>
          <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign in with your administrator credentials.</Text>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="mail-outline" size={19} color={colors.textSecondary} />
                <TextInput
                  testID="admin-email-input"
                  accessibilityLabel="Admin email"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="admin@example.com"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text }]}
                  value={email}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Password</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={19} color={colors.textSecondary} />
                <TextInput
                  testID="admin-password-input"
                  accessibilityLabel="Admin password"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  onChangeText={setPassword}
                  onSubmitEditing={() => void handleLogin()}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  style={[styles.input, { color: colors.text }]}
                  value={password}
                />
                <TouchableOpacity
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  onPress={() => setShowPassword((current) => !current)}
                  style={styles.visibilityButton}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="admin-login-button"
              accessibilityLabel="Sign in to admin portal"
              activeOpacity={0.85}
              disabled={submitting}
              onPress={() => void handleLogin()}
              style={[styles.submitButton, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
            >
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />}
              <Text style={styles.submitText}>{submitting ? "Signing in..." : "Sign in"}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.restrictedNote, { color: colors.textSecondary }]}>Authorized administrators only</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: "row" },
  heroColumn: { flex: 1.05, minWidth: 0 },
  formColumn: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 40 },
  formShell: { width: "100%", maxWidth: 430 },
  logo: { width: 190, height: 58, marginBottom: 28 },
  eyebrow: { fontFamily: "Poppins_700Bold", fontSize: 12, letterSpacing: 1.7, marginBottom: 8 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 34, lineHeight: 42 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, marginTop: 6 },
  form: { gap: 18, marginTop: 30 },
  fieldGroup: { gap: 8 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  inputWrap: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", minHeight: 52, paddingHorizontal: 15 },
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, paddingHorizontal: 11, paddingVertical: 12, outlineStyle: "none" } as any,
  visibilityButton: { alignItems: "center", justifyContent: "center", padding: 6 },
  errorBox: { alignItems: "flex-start", backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 9, padding: 12 },
  errorText: { color: "#B91C1C", flex: 1, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 19 },
  submitButton: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 52, paddingHorizontal: 18 },
  submitText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  restrictedNote: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 22, textAlign: "center" },
});
