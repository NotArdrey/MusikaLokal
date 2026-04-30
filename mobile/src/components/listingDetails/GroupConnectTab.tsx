import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

  const debugLog = (..._args: unknown[]) => {};

interface GroupConnectTabProps {
  currentUserRole: string | null;
  userVenues: any[];
  colors: any;
  isDark: boolean;
  styles: any;
  selectedVenueId: string | null;
  setSelectedVenueId: (value: string | null) => void;
  checkingVenue: boolean;
  requestMessage: string;
  setRequestMessage: (value: string) => void;
  handleSendBookingRequest: () => void;
  isSendingRequest: boolean;
  renderBookingControls: () => React.ReactNode;
  group: any;
  handleConfirm: (action: () => void, title: string, message: string) => void;
  connectionPanel?: React.ReactNode;
}

const GroupConnectTab = ({
  currentUserRole,
  userVenues,
  colors,
  isDark,
  styles,
  selectedVenueId,
  setSelectedVenueId,
  checkingVenue,
  requestMessage,
  setRequestMessage,
  handleSendBookingRequest,
  isSendingRequest,
  renderBookingControls,
  group,
  handleConfirm,
  connectionPanel,
}: GroupConnectTabProps) => (
  <View style={styles.tabContent}>
    {currentUserRole === "venue-owner" && (
      <View style={styles.section}>
        <View style={{ marginTop: 0 }}>
          {renderBookingControls()}

          {currentUserRole === "venue-owner" && userVenues.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Select Venue</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {userVenues.map((v) => (
                  <TouchableOpacity activeOpacity={1}
                    key={v.id}
                    style={[
                      styles.groupSelectChip,
                      {
                        backgroundColor:
                          selectedVenueId === v.id
                            ? colors.primary
                            : isDark
                              ? "#374151"
                              : "#F3F4F6",
                        borderColor:
                          selectedVenueId === v.id
                            ? colors.primary
                            : colors.border,
                        marginRight: 8,
                      },
                    ]}
                    onPress={() => setSelectedVenueId(v.id)}
                  >
                    <Ionicons
                      name="business"
                      size={16}
                      color={selectedVenueId === v.id ? "#FFF" : colors.text}
                    />
                    <Text
                      style={{
                        color: selectedVenueId === v.id ? "#FFF" : colors.text,
                        marginLeft: 8,
                        fontFamily: "Poppins_500Medium",
                      }}
                    >
                      {v.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {currentUserRole === "venue-owner" &&
            userVenues.length === 0 &&
            !checkingVenue && (
              <View
                style={[
                  styles.infoBox,
                  {
                    backgroundColor: "#FEE2E2",
                    borderColor: "#EF4444",
                    marginBottom: 16,
                  },
                ]}
              >
                <Text style={[styles.infoText, { color: "#B91C1C" }]}>
                  You don't have any venues listed. Please create a venue to send invites.
                </Text>
              </View>
            )}

          <Text style={[styles.label, { color: colors.text }]}>Send Booking Request</Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: isDark ? "#374151" : "#F9FAFB",
                height: 100,
                marginBottom: 16,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text, height: "100%" }]}
              placeholder="Describe your event..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              value={requestMessage}
              onChangeText={setRequestMessage}
            />
          </View>

          <TouchableOpacity activeOpacity={1}
            style={[
              styles.uploadBox,
              { borderColor: colors.border, height: 80, marginBottom: 16 },
            ]}
          >
            <Ionicons name="attach-outline" size={24} color={colors.primary} />
            <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>
              Attach Event Proposal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleSendBookingRequest}
            disabled={checkingVenue || isSendingRequest}
            activeOpacity={1}
          >
            {isSendingRequest ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {checkingVenue ? "Checking..." : "Send Request"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    )}

    {currentUserRole === "musician" &&
      group.requirements?.audition && (
        <View
          style={[
            styles.section,
            currentUserRole === "venue-owner" && {
              marginTop: 32,
            },
          ]}
        >
          {currentUserRole === "musician" && (
            <>
              <View
                style={[
                  styles.auditionBanner,
                  { borderColor: isDark ? "#065F46" : "#86EFAC" },
                ]}
              >
                <Text
                  style={{
                    fontFamily: "Poppins_600SemiBold",
                    color: colors.text,
                  }}
                >
                  Active Audition: {group.requirements.audition_role || "Musician"}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    marginTop: 4,
                  }}
                >
                  {group.requirements.audition_desc ||
                    "Open audition for this project."}
                </Text>
              </View>

              <View style={{ marginTop: 16 }}>
                <TouchableOpacity
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.primary,
                    backgroundColor: isDark ? `${colors.primary}26` : `${colors.primary}14`,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  onPress={() =>
                    handleConfirm(
                      () => debugLog("Applied for Audition"),
                      "Apply for Audition",
                      `Confirm your application for the ${group.requirements.audition_role || "Musician"} position?`,
                    )
                  }
                  activeOpacity={1}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDark ? "#111827" : "#FFFFFF",
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Ionicons name="person-add" size={16} color={colors.primary} />
                    </View>
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontFamily: "Poppins_600SemiBold",
                          fontSize: 14,
                        }}
                      >
                        Apply for Audition
                      </Text>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontFamily: "Poppins_400Regular",
                          fontSize: 12,
                          marginTop: 1,
                        }}
                      >
                        {group.requirements.audition_role || "Musician"} role
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

    {connectionPanel ? (
      <View
        style={{
          marginTop:
            ((currentUserRole === "venue-owner") ||
              ((currentUserRole === "musician") &&
                group?.requirements?.audition))
              ? 32
              : 0,
        }}
      >
        {connectionPanel}
      </View>
    ) : null}
  </View>
);

export default GroupConnectTab;

