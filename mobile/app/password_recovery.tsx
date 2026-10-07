import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearSupabaseAuthStorage, supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { useTheme } from "../src/context/ThemeContext";
import { typography } from "../src/theme/tokens";
import {
  establishRecoverySession, parseRecoveryUrl, RECOVERY_LINK_ERROR,
  signOutRecoverySession, updateRecoveryPassword, validateRecoveryPassword, type RecoverySession,
} from "../src/utils/passwordRecovery";

const config = { url: supabaseUrl, anonKey: supabaseAnonKey };

export default function PasswordRecoveryScreen() {
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const credentialQuery = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value || ""])).toString();
  const sessionRef = useRef<RecoverySession | null>(null);
  const requestRef = useRef<{ query: string; controller: AbortController; promise: Promise<RecoverySession> } | null>(null);
  const busyRef = useRef(false);
  const generationRef = useRef(0);
  const passwordChangedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "success">("loading");
  const [settledQuery, setSettledQuery] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const visibleStatus = settledQuery === credentialQuery ? status : "loading";
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const generation = ++generationRef.current;
    sessionRef.current = null;
    passwordChangedRef.current = false;
    if (requestRef.current?.query !== credentialQuery) {
      requestRef.current?.controller.abort();
      const controller = new AbortController();
      const credential = parseRecoveryUrl(`musikalokal://password_recovery?${credentialQuery}`);
      requestRef.current = { query: credentialQuery, controller, promise: establishRecoverySession(config, credential || { kind: "invalid" }, controller.signal) };
    }
    // Effect replay shares the same single-use verification request.
    void requestRef.current.promise.then(session => {
      if (generationRef.current !== generation) return;
      sessionRef.current = session;
      setSettledQuery(credentialQuery); setStatus("ready"); setMessage(""); setPassword(""); setConfirmation(""); setPasswordChanged(false);
    }).catch(error => {
      if (generationRef.current !== generation) return;
      setSettledQuery(credentialQuery); setStatus("error"); setMessage(error instanceof Error ? error.message : RECOVERY_LINK_ERROR);
    });
    return () => { generationRef.current = generation + 1; sessionRef.current = null; };
  }, [credentialQuery]);

  const submit = async () => {
    if (busyRef.current || !sessionRef.current || visibleStatus !== "ready") return;
    if (!passwordChangedRef.current) {
      const error = validateRecoveryPassword(password, confirmation);
      if (error) { setMessage(error); return; }
    }
    const generation = generationRef.current;
    const session = sessionRef.current;
    busyRef.current = true; setBusy(true); setMessage("");
    try {
      if (!passwordChangedRef.current) {
        await updateRecoveryPassword(config, session, password, confirmation);
        if (generationRef.current !== generation) return;
        passwordChangedRef.current = true;
        setPasswordChanged(true);
        setPassword(""); setConfirmation("");
      }
      await signOutRecoverySession(config, session);
      if (generationRef.current !== generation) return;
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new Error("Your password was updated. Please try signing out again.");
      await clearSupabaseAuthStorage();
      sessionRef.current = null; setStatus("success");
    } catch (error) {
      if (generationRef.current !== generation) return;
      const text = error instanceof Error ? error.message : "Unable to reset your password. Please try again.";
      setMessage(text);
      if (!passwordChangedRef.current && text === RECOVERY_LINK_ERROR) { sessionRef.current = null; setStatus("error"); }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Reset Password</Text>
        {visibleStatus === "loading" && <><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary }}>Checking your reset link...</Text></>}
        {visibleStatus === "ready" && <>
          {!passwordChanged && <>
            <Text style={[styles.label, { color: colors.text }]}>New Password</Text>
            <TextInput accessibilityLabel="New Password" style={[styles.input, { color: colors.text, borderColor: colors.border }]} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" value={password} onChangeText={setPassword} editable={!busy} />
            <Text style={[styles.label, { color: colors.text }]}>Confirm New Password</Text>
            <TextInput accessibilityLabel="Confirm New Password" style={[styles.input, { color: colors.text, borderColor: colors.border }]} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" value={confirmation} onChangeText={setConfirmation} editable={!busy} />
          </>}
          <TouchableOpacity accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]} disabled={busy} onPress={submit}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{passwordChanged ? "Finish Signing Out" : "Reset Password"}</Text>}
          </TouchableOpacity>
        </>}
        {!!message && visibleStatus !== "loading" && <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text>}
        {visibleStatus === "error" && <TouchableOpacity accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.replace("/forget_password")}><Text style={styles.buttonText}>Request a New Link</Text></TouchableOpacity>}
        {visibleStatus === "success" && <>
          <Text style={{ color: colors.text }}>Your password has been reset. Log in with your new password.</Text>
          <TouchableOpacity accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.replace("/")}><Text style={styles.buttonText}>Back to Login</Text></TouchableOpacity>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  title: { fontFamily: typography.title, fontSize: 28, marginVertical: 16 },
  label: { fontFamily: typography.medium, fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontFamily: typography.body, fontSize: 16 },
  button: { minHeight: 48, borderRadius: 12, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontFamily: typography.semibold, fontSize: 16 },
});
