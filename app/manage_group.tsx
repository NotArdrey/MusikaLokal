import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

import { useLocalSearchParams } from "expo-router";

export default function GroupDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { isSystemLocked, showLockAlert } = useAuth();
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState("About");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalButtonText, setModalButtonText] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [group, setGroup] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Role-based access control
  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase.functions.invoke(
        "manage-profile",
        {
          body: { action: "fetch", userId: user.id },
        },
      );

      if (profile?.role !== "musician") {
        Alert.alert("Unauthorized", "Only musicians can access this page.");
        router.replace("/home");
        return;
      }

      setAuthorized(true);
      if (id) fetchData(user.id);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/home");
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchData = async (userId: string) => {
    setLoading(true);
    try {
      // Ensure id is a string, not an array
      const groupId = Array.isArray(id) ? id[0] : id;
      if (!groupId) {
        Alert.alert("Error", "Invalid group ID");
        router.replace("/home");
        return;
      }

      // Fetch Group Details
      const { data: groupData, error: groupError } =
        await supabase.functions.invoke("manage-listings", {
          body: { action: "fetch_one", type: "group", id: groupId, userId },
        });
      if (groupError) throw groupError;
      setGroup(groupData);

      // Fetch Group Applications (Sent)
      const { data: appData, error: appError } =
        await supabase.functions.invoke("manage-listings", {
          body: {
            action: "fetch_group_applications",
            groupId: groupId,
            userId,
          },
        });
      if (appError) throw appError;
      setApplications(appData || []);

      // Fetch Reviews
      const { data: reviewData, error: reviewError } =
        await supabase.functions.invoke("manage-listings", {
          body: { action: "fetch_reviews", type: "group", id: groupId, userId },
        });
      if (reviewError) throw reviewError;
      setReviews(reviewData || []);
    } catch (e) {
      console.log("Error fetching data:", e);
      Alert.alert("Error", "Failed to load group data");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (action: string) => {
    if (action === "accept") {
      setModalTitle("Accept Invitation");
      setModalMessage("Are you sure you want to accept this invitation?");
      setModalButtonText("Accept");
    } else {
      setModalTitle("Decline Invitation");
      setModalMessage("Are you sure you want to decline this invitation?");
      setModalButtonText("Decline");
    }
    setModalVisible(true);
  };

  const tabs = ["About", "Applications", "Review"];

  // Show loading while checking authorization
  if (checkingAuth) {
    return (
      <View
        style={[
          styles.flex1,
          styles.centerContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={{
            marginTop: 16,
            color: colors.textSecondary,
            fontFamily: "Poppins_400Regular",
          }}
        >
          Checking permissions...
        </Text>
      </View>
    );
  }

  // Don't render if not authorized
  if (!authorized) {
    return null;
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Manage Group" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header Image & Info */}
          <View style={styles.headerContainer}>
            <View
              style={[
                styles.headerImageContainer,
                {
                  shadowColor: colors.primary,
                },
              ]}
            >
              <Image
                source={{
                  uri:
                    (group?.images && group.images[0]) || group?.image || null,
                }}
                style={[styles.headerImage, { backgroundColor: colors.border }]}
                resizeMode="cover"
              />
              <View style={styles.headerImageGradient} />
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {group?.name || "Loading..."}
            </Text>
            <Text
              style={[styles.headerLocation, { color: colors.textSecondary }]}
            >
              {group?.genre || "Genre N/A"} •{" "}
              {group?.location || "Location N/A"}
            </Text>
          </View>

          {/* Segmented Control Tabs */}
          <View
            style={[
              styles.tabsContainer,
              { backgroundColor: colors.inputBackground },
            ]}
          >
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tab,
                  {
                    backgroundColor:
                      activeTab === tab ? colors.surface : "transparent",
                    shadowColor: "#000",
                    shadowOffset: {
                      width: 0,
                      height: activeTab === tab ? 2 : 0,
                    },
                    shadowOpacity: activeTab === tab ? 0.05 : 0,
                    shadowRadius: 4,
                    elevation: activeTab === tab ? 2 : 0,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      fontFamily:
                        activeTab === tab
                          ? "Poppins_600SemiBold"
                          : "Poppins_500Medium",
                      color:
                        activeTab === tab
                          ? colors.primary
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.contentContainer}>
            {activeTab === "About" && (
              <View style={styles.aboutContainer}>
                <View>
                  <Text
                    style={[styles.aboutText, { color: colors.textSecondary }]}
                  >
                    {group?.description || "No description available."}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Members
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {group?.members?.length || 0}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Rate
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      ₱{(group?.rate || 0).toLocaleString()}/hr
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Genre
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 14,
                      }}
                    >
                      {group?.genre || "N/A"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Group Type
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 14,
                        textTransform: "capitalize",
                      }}
                    >
                      {group?.group_type || "N/A"}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Members & Roles
                  </Text>
                  {group?.members && group.members.length > 0 ? (
                    group.members.map((member: any, index: number) => {
                      const memberName =
                        typeof member === "string"
                          ? member
                          : member?.name || member?.full_name || "Member";
                      const memberInstrument =
                        typeof member === "string"
                          ? ""
                          : member?.instrument || "";
                      const memberRole =
                        typeof member === "string" ? "" : member?.role || "";
                      return (
                        <View
                          key={index}
                          style={[
                            styles.memberRow,
                            { borderColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.memberName,
                                { color: colors.text },
                              ]}
                            >
                              {memberName}
                            </Text>
                            {(memberInstrument || memberRole) && (
                              <Text
                                style={[
                                  styles.memberMeta,
                                  { color: colors.textSecondary },
                                ]}
                              >
                                {memberInstrument}
                                {memberInstrument && memberRole ? " • " : ""}
                                {memberRole}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      No members listed.
                    </Text>
                  )}
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Gallery
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.galleryContainer}
                  >
                    {group?.images && group.images.length > 0 ? (
                      group.images.map((img: string, i: number) => (
                        <Image
                          key={i}
                          source={{ uri: img }}
                          style={styles.galleryImage}
                        />
                      ))
                    ) : (
                      <Text style={{ color: colors.textSecondary }}>
                        No images uploaded.
                      </Text>
                    )}
                  </ScrollView>
                </View>
              </View>
            )}

            {activeTab === "Applications" && (
              <View style={styles.aboutContainer}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Sent Applications
                </Text>

                {applications.length === 0 ? (
                  <Text style={{ color: colors.textSecondary }}>
                    No applications sent yet.
                  </Text>
                ) : (
                  applications.map((app) => (
                    <View
                      key={app.id}
                      style={[
                        styles.setupCard,
                        { backgroundColor: colors.surface, marginBottom: 12 },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={[styles.setupTitle, { color: colors.text }]}
                        >
                          {app.gig?.name || "Unknown Gig"}
                        </Text>
                        <Text
                          style={{
                            color:
                              app.status === "approved"
                                ? "green"
                                : app.status === "pending"
                                  ? "orange"
                                  : "red",
                            fontWeight: "bold",
                          }}
                        >
                          {app.status.toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        style={{ color: colors.textSecondary, marginBottom: 4 }}
                      >
                        {app.gig?.location}
                      </Text>
                      <Text
                        style={{ color: colors.textSecondary, marginBottom: 8 }}
                      >
                        Payout: ₱{(app.gig?.budget || 0).toLocaleString()}
                      </Text>
                      <Text style={{ color: colors.textSecondary }}>
                        Applied on:{" "}
                        {new Date(app.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {activeTab === "Review" && (
              <View>
                <View style={styles.reviewHeader}>
                  <Text style={[styles.ratingText, { color: colors.text }]}>
                    {group?.rating?.toFixed(1) || "0.0"}
                  </Text>
                  <View style={styles.starsRow}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={i}
                        name={
                          i < Math.round(group?.rating || 0)
                            ? "star"
                            : "star-outline"
                        }
                        size={20}
                        color={colors.primary}
                      />
                    ))}
                  </View>
                  <Text
                    style={{
                      fontFamily: "Poppins_400Regular",
                      color: colors.textSecondary,
                    }}
                  >
                    Based on {group?.review_count || 0} reviews
                  </Text>
                </View>

                {reviews.length > 0 ? (
                  reviews.map((review) => (
                    <View
                      key={review.id}
                      style={[
                        styles.reviewCard,
                        { backgroundColor: colors.surface, marginBottom: 12 },
                      ]}
                    >
                      <View style={styles.reviewUserHeader}>
                        <View style={styles.userInfo}>
                          <Image
                            source={{ uri: review.author?.avatar_url || null }}
                            style={[
                              styles.userAvatar,
                              { backgroundColor: colors.border },
                            ]}
                          />
                          <Text
                            style={{
                              fontFamily: "Poppins_600SemiBold",
                              color: colors.text,
                            }}
                          >
                            {review.author?.full_name || "User"}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.textSecondary,
                            fontFamily: "Poppins_400Regular",
                          }}
                        >
                          {new Date(review.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={[styles.starsRow, { marginBottom: 8 }]}>
                        {[...Array(5)].map((_, i) => (
                          <Ionicons
                            key={i}
                            name={i < review.rating ? "star" : "star-outline"}
                            size={14}
                            color={colors.primary}
                          />
                        ))}
                      </View>
                      <Text
                        style={[
                          styles.reviewText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {review.comment}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: colors.textSecondary }}>
                    No reviews yet.
                  </Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        <Navbar />
      </View>
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 150,
  },
  headerContainer: {
    paddingHorizontal: 24,
    marginTop: 16,
    alignItems: "center",
  },
  headerImageContainer: {
    width: "100%",
    height: 192,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 16,
    position: "relative",
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },
  headerImageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
    // Approximate gradient with transparent black
    backgroundColor: "rgba(0,0,0,0.4)",
    top: 100, // cheat to make it look like bottom gradient
  },
  headerTitle: {
    fontSize: 24,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
  },
  headerLocation: {
    textAlign: "center",
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
  },
  tabsContainer: {
    marginHorizontal: 24,
    marginTop: 24,
    padding: 4,
    borderRadius: 16,
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 13,
  },
  contentContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  aboutContainer: {
    gap: 24,
  },
  aboutText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: "Poppins_400Regular",
  },
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  infoLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: "Poppins_600SemiBold",
  },
  infoValue: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  memberRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  memberName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  memberMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  availabilityCard: {
    padding: 16,
    borderRadius: 16,
  },
  availabilityItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  availabilityTitle: {
    fontFamily: "Poppins_500Medium",
  },
  availabilitySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 999,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "white",
    shadowColor: "black",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  completionCard: {
    padding: 16,
    borderRadius: 16,
  },
  completionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  completionValue: {
    fontSize: 24,
    fontFamily: "Poppins_600SemiBold",
  },
  progressBarContainer: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#10b981",
    borderRadius: 6,
  },
  galleryContainer: {
    gap: 12,
  },
  galleryImage: {
    width: 160,
    height: 112,
    borderRadius: 12,
    marginRight: 12,
  },
  invitationCard: {
    padding: 16,
    borderRadius: 24,
  },
  invitationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  invitationImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  invitationTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  invitationSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  starRatingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  invitationDetails: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 8,
    borderRadius: 8,
  },
  invitationDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  invitationPrice: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  invitationMessage: {
    marginBottom: 16,
    fontStyle: "italic",
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  setupCard: {
    padding: 16,
    borderRadius: 16,
  },
  setupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  setupTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  editLink: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  stagePlotContainer: {
    height: 192,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stagePlotText: {
    fontSize: 12,
    marginTop: 8,
    fontFamily: "Poppins_400Regular",
  },
  inputListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  channelNumber: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    marginRight: 12,
  },
  inputName: {
    fontFamily: "Poppins_500Medium",
  },
  inputDetails: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  hospitalityCard: {
    padding: 16,
    borderRadius: 16,
  },
  featuredVideoContainer: {
    padding: 16,
    borderRadius: 16,
  },
  featuredVideo: {
    height: 192,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    marginBottom: 12,
  },
  playIconOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  videoTitle: {
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
    marginBottom: 4,
  },
  videoViews: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  pressCard: {
    width: 256,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 16,
  },
  pressMetric: {
    fontSize: 30,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
  },
  pressLabel: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  pressSource: {
    fontSize: 12,
    marginTop: 8,
    color: "#9CA3AF",
  },
  audioDemoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  trackTitle: {
    fontFamily: "Poppins_500Medium",
  },
  trackDuration: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  reviewHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  ratingText: {
    fontSize: 48,
    marginBottom: 8,
    fontFamily: "Poppins_600SemiBold",
  },
  starsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  reviewUserHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reviewText: {
    lineHeight: 20,
  },
});
