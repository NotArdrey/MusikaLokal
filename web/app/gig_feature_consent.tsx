import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { useTheme } from "../src/context/ThemeContext";

const acceptedStatuses = new Set(["accepted", "approved"]);

export default function GigFeatureConsentScreen() {
  const { colors, isDark } = useTheme();
  const { applicationId: rawApplicationId } = useLocalSearchParams<{
    applicationId?: string | string[];
  }>();
  const applicationId = Array.isArray(rawApplicationId) ? rawApplicationId[0] : rawApplicationId;
  const [application, setApplication] = useState<any>(null);
  const [showOnGigPage, setShowOnGigPage] = useState(false);
  const [showOnProfile, setShowOnProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const invokeConsentAction = useCallback(async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in to manage featuring permission.");

    const { data, error } = await supabase.functions.invoke("gig-applications", {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw new Error(error.message || "The featuring request could not be completed.");
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadApplication = useCallback(async () => {
    if (!applicationId) {
      setErrorMessage("This featuring request is missing its application reference.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const data = await invokeConsentAction({ action: "fetch_feature_consent", applicationId });
      setApplication(data);
      setShowOnGigPage(data?.show_on_gig_page === true);
      setShowOnProfile(data?.show_on_profile === true);
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to load the featuring request.");
    } finally {
      setLoading(false);
    }
  }, [applicationId, invokeConsentAction]);

  useEffect(() => {
    loadApplication();
  }, [loadApplication]);

  const saveConsent = async (nextGigPage = showOnGigPage, nextProfile = showOnProfile) => {
    if (!applicationId || saving) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const data = await invokeConsentAction({
        action: "respond_feature_consent",
        applicationId,
        showOnGigPage: nextGigPage,
        showOnProfile: nextProfile,
      });
      setApplication(data);
      setShowOnGigPage(data?.show_on_gig_page === true);
      setShowOnProfile(data?.show_on_profile === true);
      setSuccessMessage(
        nextGigPage || nextProfile
          ? "Your featuring choices were saved."
          : "Your application will remain private.",
      );
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to save your featuring choices.");
    } finally {
      setSaving(false);
    }
  };

  const performer = application?.group || application?.production_roster?.roster_group || application?.applicant || application?.production_roster?.roster_profile;
  const performerSnapshot = application?.performer_snapshot || {};
  const performerName = performer?.name || performer?.full_name || performerSnapshot?.display_name || "Accepted performer";
  const performerAvatar = performer?.images?.[0] || performer?.avatar_url || performerSnapshot?.avatar_url;
  const status = String(application?.status || "").toLowerCase();
  const canRespond = acceptedStatuses.has(status);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Featuring Permission" onBackPress={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>Loading permission request...</Text>
          </View>
        ) : errorMessage && !application ? (
          <View style={[styles.messageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="alert-circle-outline" size={30} color="#EF4444" />
            <Text style={[styles.messageTitle, { color: colors.text }]}>Unable to open this request</Text>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>{errorMessage}</Text>
            <TouchableOpacity onPress={loadApplication} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[styles.heroCard, { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: colors.border }]}>
              <View style={styles.heroIcon}>
                <Ionicons name="megaphone-outline" size={25} color={colors.primary} />
              </View>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Would you like to be featured?</Text>
              <Text style={[styles.heroCopy, { color: colors.textSecondary }]}>
                You were accepted for {application?.gig?.name || "this gig"}. Choose where your accepted-performer credit may appear. This does not affect your acceptance.
              </Text>
            </View>

            <View style={[styles.performerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {performerAvatar ? <Image source={{ uri: performerAvatar }} style={styles.avatar} /> : (
                <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                  <Ionicons name="musical-notes" size={24} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.performerName, { color: colors.text }]}>{performerName}</Text>
                <Text style={[styles.performerMeta, { color: colors.textSecondary }]}>{application?.gig?.location || "Gig performer"}</Text>
              </View>
              <View style={[styles.acceptedBadge, { backgroundColor: "#10B98118" }]}>
                <Text style={styles.acceptedBadgeText}>Accepted</Text>
              </View>
            </View>

            <View style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>Feature me on the gig page</Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>Show your approved performer name and avatar in the gigâ€™s Featured Performers section.</Text>
              </View>
              <Switch
                testID="feature-on-gig-page-toggle"
                value={showOnGigPage}
                onValueChange={setShowOnGigPage}
                disabled={!canRespond || saving}
                trackColor={{ false: isDark ? "#374151" : "#CBD5E1", true: colors.primary + "90" }}
                thumbColor={showOnGigPage ? colors.primary : "#F8FAFC"}
              />
            </View>

            <View style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>Show this accepted gig on my profile</Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>Add this accepted gig to your public profile activity.</Text>
              </View>
              <Switch
                testID="feature-on-profile-toggle"
                value={showOnProfile}
                onValueChange={setShowOnProfile}
                disabled={!canRespond || saving}
                trackColor={{ false: isDark ? "#374151" : "#CBD5E1", true: colors.primary + "90" }}
                thumbColor={showOnProfile ? colors.primary : "#F8FAFC"}
              />
            </View>

            <View style={[styles.privacyNote, { backgroundColor: colors.inputBackground }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
              <Text style={[styles.privacyText, { color: colors.textSecondary }]}>Private by default. You can return here from your accepted gig in Bookings and change these choices later.</Text>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

            <TouchableOpacity
              testID="save-feature-consent"
              disabled={!canRespond || saving}
              onPress={() => saveConsent()}
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !canRespond || saving ? 0.55 : 1 }]}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save Featuring Choices</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              testID="keep-feature-private"
              disabled={!canRespond || saving}
              onPress={() => saveConsent(false, false)}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Keep My Application Private</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 130 },
  centerState: { alignItems: "center", paddingTop: 50 },
  stateText: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 10 },
  messageCard: { borderWidth: 1, borderRadius: 16, padding: 22, alignItems: "center" },
  messageTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, marginTop: 10 },
  heroCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center" },
  heroIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#14B8A61A", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 19, marginTop: 12, textAlign: "center" },
  heroCopy: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 7 },
  performerCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 15, padding: 14, marginTop: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  performerName: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  performerMeta: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  acceptedBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  acceptedBadgeText: { color: "#10B981", fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  optionCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 15, padding: 16, marginTop: 12 },
  optionCopy: { flex: 1 },
  optionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  optionDescription: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17, marginTop: 4 },
  privacyNote: { flexDirection: "row", gap: 10, borderRadius: 12, padding: 13, marginTop: 14 },
  privacyText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17 },
  errorText: { color: "#EF4444", fontFamily: "Poppins_500Medium", fontSize: 12, textAlign: "center", marginTop: 12 },
  successText: { color: "#10B981", fontFamily: "Poppins_500Medium", fontSize: 12, textAlign: "center", marginTop: 12 },
  primaryButton: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 18, paddingHorizontal: 18 },
  primaryButtonText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 10, paddingHorizontal: 18 },
  secondaryButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});

