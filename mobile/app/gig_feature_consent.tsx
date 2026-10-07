import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
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
import { useGigFeatureConsent } from "../src/hooks/useGigFeatureConsent";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { useTheme } from "../src/context/ThemeContext";
import { LoadingButtonContent } from "../src/components/LoadingState";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { typography } from "../src/theme/tokens";

export default function GigFeatureConsentScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(32);
  const { applicationId: rawApplicationId } = useLocalSearchParams<{
    applicationId?: string | string[];
  }>();
  const applicationId = Array.isArray(rawApplicationId) ? rawApplicationId[0] : rawApplicationId;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({ pathname: "/bookings", params: { tab: "History" } });
  };
  const { application, loading, saving, errorMessage, successMessage, loadApplication, saveConsent } = useGigFeatureConsent(applicationId);
  const [draft, setDraft] = useState<{
    application: any; showOnGigPage: boolean; showOnProfile: boolean; selfShowOnProfile: boolean;
  } | null>(null);
  const choices = draft && draft.application === application ? draft : {
    application, showOnGigPage: application?.show_on_gig_page === true,
    showOnProfile: application?.show_on_profile === true,
    selfShowOnProfile: application?.self_show_on_profile === true,
  };
  const { showOnGigPage, showOnProfile, selfShowOnProfile } = choices;
  const setShowOnGigPage = (value: boolean) => setDraft({ ...choices, showOnGigPage: value });
  const setShowOnProfile = (value: boolean) => setDraft({ ...choices, showOnProfile: value });
  const setSelfShowOnProfile = (value: boolean) => setDraft({ ...choices, selfShowOnProfile: value });
  const isGroup = application?.is_group_performance === true;
  const canRespond = application?.can_edit_self === true;
  const canManageBand = application?.can_edit_group === true;
  const performer = application?.group || application?.production_roster?.roster_group || application?.applicant || application?.production_roster?.roster_profile;
  const performerSnapshot = application?.performer_snapshot || {};
  const performerName = performer?.name || performer?.full_name || performerSnapshot?.display_name || "Accepted performer";
  const performerAvatar = performer?.images?.[0] || performer?.avatar_url || performerSnapshot?.avatar_url;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Featuring Permission" onBackPress={handleBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
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
                <Text style={[styles.optionTitle, { color: colors.text }]}>Show this gig on my public profile</Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>Your choice applies only to your profile. You will still see the gig in your own activity when this is off.</Text>
              </View>
              <Switch testID="feature-on-profile-toggle" value={selfShowOnProfile} onValueChange={setSelfShowOnProfile}
                disabled={!canRespond || Boolean(saving)}
                trackColor={{ false: isDark ? "#374151" : "#CBD5E1", true: colors.primary + "90" }}
                thumbColor={selfShowOnProfile ? colors.primary : "#F8FAFC"} />
            </View>
            {!isGroup ? (
              <View style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>Feature me on the gig and Feed pages</Text>
                  <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>Show your performer name and avatar in the lineup.</Text>
                </View>
                <Switch testID="feature-on-gig-page-toggle" value={showOnGigPage} onValueChange={setShowOnGigPage}
                  disabled={!canRespond || Boolean(saving)}
                  trackColor={{ false: isDark ? "#374151" : "#CBD5E1", true: colors.primary + "90" }}
                  thumbColor={showOnGigPage ? colors.primary : "#F8FAFC"} />
              </View>
            ) : null}
            <TouchableOpacity testID="save-feature-consent" disabled={!canRespond || Boolean(saving)}
              onPress={() => saveConsent("self", selfShowOnProfile, isGroup ? false : showOnGigPage)}
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !canRespond || saving ? 0.55 : 1 }]}>
              {saving === "self" ? <LoadingButtonContent message="Saving choice..." /> : <Text style={styles.primaryButtonText}>Save My Choice</Text>}
            </TouchableOpacity>
            <TouchableOpacity testID="keep-feature-private" disabled={!canRespond || Boolean(saving)}
              onPress={() => saveConsent("self", false, isGroup ? false : showOnGigPage)}
              style={[styles.secondaryButton, { borderColor: colors.border }]}>
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Hide From My Public Profile</Text>
            </TouchableOpacity>
            {isGroup && canManageBand ? (
              <>
                <View style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>Feature the band on the gig and Feed pages</Text>
                    <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>The band appears once in the lineup. Each member controls their own profile.</Text>
                  </View>
                  <Switch testID="feature-band-on-gig-toggle" value={showOnGigPage} onValueChange={setShowOnGigPage}
                    disabled={Boolean(saving)} trackColor={{ false: isDark ? "#374151" : "#CBD5E1", true: colors.primary + "90" }}
                    thumbColor={showOnGigPage ? colors.primary : "#F8FAFC"} />
                </View>
                <View style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>Show this gig on the band’s public page</Text>
                    <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>Add the performance to the band’s timeline.</Text>
                  </View>
                  <Switch testID="feature-band-on-profile-toggle" value={showOnProfile} onValueChange={setShowOnProfile}
                    disabled={Boolean(saving)} trackColor={{ false: isDark ? "#374151" : "#CBD5E1", true: colors.primary + "90" }}
                    thumbColor={showOnProfile ? colors.primary : "#F8FAFC"} />
                </View>
                <TouchableOpacity testID="save-band-feature-consent" disabled={Boolean(saving)}
                  onPress={() => saveConsent("group", showOnProfile, showOnGigPage)}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: saving ? 0.55 : 1 }]}>
                  {saving === "group" ? <LoadingButtonContent message="Saving band choices..." /> : <Text style={styles.primaryButtonText}>Save Band Choices</Text>}
                </TouchableOpacity>
              </>
            ) : null}

            <View style={[styles.privacyNote, { backgroundColor: colors.inputBackground }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
              <Text style={[styles.privacyText, { color: colors.textSecondary }]}>Private by default. Each member controls their own profile. The band leader controls the band feature. Return here from Bookings to change your choices.</Text>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}


          </>
        )}
      </ScrollView>
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14 },
  centerState: { alignItems: "center", paddingTop: 50 },
  stateText: { fontFamily: typography.body, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 10 },
  messageCard: { borderWidth: 1, borderRadius: 16, padding: 22, alignItems: "center" },
  messageTitle: { fontFamily: typography.heading, fontSize: 16, marginTop: 10 },
  heroCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center" },
  heroIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#14B8A61A", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: typography.heading, fontSize: 19, marginTop: 12, textAlign: "center" },
  heroCopy: { fontFamily: typography.body, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 7 },
  performerCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 15, padding: 14, marginTop: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  performerName: { fontFamily: typography.semibold, fontSize: 14 },
  performerMeta: { fontFamily: typography.body, fontSize: 11, marginTop: 2 },
  acceptedBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  acceptedBadgeText: { color: "#10B981", fontFamily: typography.semibold, fontSize: 10 },
  optionCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 15, padding: 16, marginTop: 12 },
  optionCopy: { flex: 1 },
  optionTitle: { fontFamily: typography.semibold, fontSize: 14 },
  optionDescription: { fontFamily: typography.body, fontSize: 11, lineHeight: 17, marginTop: 4 },
  privacyNote: { flexDirection: "row", gap: 10, borderRadius: 12, padding: 13, marginTop: 14 },
  privacyText: { flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 17 },
  errorText: { color: "#EF4444", fontFamily: typography.medium, fontSize: 12, textAlign: "center", marginTop: 12 },
  successText: { color: "#10B981", fontFamily: typography.medium, fontSize: 12, textAlign: "center", marginTop: 12 },
  primaryButton: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 18, paddingHorizontal: 18 },
  primaryButtonText: { color: "#FFFFFF", fontFamily: typography.semibold, fontSize: 14 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 10, paddingHorizontal: 18 },
  secondaryButtonText: { fontFamily: typography.semibold, fontSize: 13 },
});
