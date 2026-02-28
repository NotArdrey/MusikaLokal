import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ActivityIndicator,
    Linking,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import DocumentUploader from "../DocumentUploader";
import styles from "../ListingDetailsSheet.styles";
import VideoUploader from "../VideoUploader";

const debugLog = (..._args: unknown[]) => {};

interface GigApplyTabProps {
  colors: any;
  isDark: boolean;
  group: any;
  userId: string | null;
  pitchMessage: string;
  setPitchMessage: (value: string) => void;
  cvUrl: string;
  setCvFile: (file: any) => void;
  videoUrl: string;
  setVideoUrl: (value: string) => void;
  isSubmittingApplication: boolean;
  hasExistingApplication: boolean;
  existingApplicationStatus: string | null;
  isBlocked: boolean;
  blockReason: string | null;
  userGroups: any[];
  selectedGroupId: string | null;
  setSelectedGroupId: (value: string | null) => void;
  selectedSlotType: "solo" | "duo" | "band" | null;
  setSelectedSlotType: (value: "solo" | "duo" | "band" | null) => void;
  groupAlreadyApplied: boolean;
  groupApplicationBy: string | null;
  handleSubmitApplication: () => void;
}

const GigApplyTab = ({
  colors,
  isDark,
  group,
  userId,
  pitchMessage,
  setPitchMessage,
  cvUrl,
  setCvFile,
  videoUrl,
  setVideoUrl,
  isSubmittingApplication,
  hasExistingApplication,
  existingApplicationStatus,
  isBlocked,
  blockReason,
  userGroups,
  selectedGroupId,
  setSelectedGroupId,
  selectedSlotType,
  setSelectedSlotType,
  groupAlreadyApplied,
  groupApplicationBy,
  handleSubmitApplication,
}: GigApplyTabProps) => {
  debugLog("🎨 renderGigApply called");
  debugLog("Current state:", {
    pitchMessage,
    videoUrl,
    isSubmittingApplication,
    userId,
    listingId: group?.id,
  });

  const musicianTypeRequired = group?.requirements?.musician_type || "both";
  const hasGroups = userGroups.length > 0;
  const slots = group?.requirements?.slots || {};
  const requiredSlotTypes = (["solo", "duo", "band"] as const).filter(
    (slotType) => (slots?.[slotType]?.needed || 0) > 0,
  );

  const isBandType = (g: any) => (g?.group_type || "band") === "band";
  const isDuoType = (g: any) => g?.group_type === "duo";

  const filteredGroups = userGroups.filter((g) => {
    if (selectedSlotType === "duo") return isDuoType(g);
    if (selectedSlotType === "band") return isBandType(g);
    return true;
  });

  const getEnabledSlotTypes = () => {
    if (requiredSlotTypes.length === 0) return [] as ("solo" | "duo" | "band")[];

    return requiredSlotTypes.filter((slotType) => {
      if (musicianTypeRequired === "solo" && slotType !== "solo") return false;
      if (musicianTypeRequired === "group" && slotType === "solo") return false;
      if (slotType === "duo" && !userGroups.some((g) => isDuoType(g))) return false;
      if (slotType === "band" && !userGroups.some((g) => isBandType(g))) return false;
      return true;
    });
  };

  React.useEffect(() => {
    if (!selectedGroupId) return;
    const stillVisible = filteredGroups.some((g) => g.id === selectedGroupId);
    if (!stillVisible) {
      setSelectedGroupId(null);
    }
  }, [filteredGroups, selectedGroupId, setSelectedGroupId]);

  React.useEffect(() => {
    const enabledSlotTypes = getEnabledSlotTypes();

    if (enabledSlotTypes.length === 0) {
      if (selectedSlotType !== null) {
        setSelectedSlotType(null);
      }
      return;
    }

    if (!selectedSlotType || !enabledSlotTypes.includes(selectedSlotType)) {
      setSelectedSlotType(enabledSlotTypes[0]);
    }
  }, [
    musicianTypeRequired,
    selectedGroupId,
    selectedSlotType,
    setSelectedSlotType,
    group?.id,
    group?.requirements?.slots,
  ]);

  return (
    <View style={styles.tabContent}>
      {isBlocked && (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: "#EF444420",
              borderColor: "#EF4444",
              marginBottom: 32,
            },
          ]}
        >
          <Ionicons name="alert-circle" size={24} color="#EF4444" />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.infoText,
                { color: colors.text, fontFamily: "Poppins_600SemiBold" },
              ]}
            >
              Action Restricted
            </Text>
            <Text style={[styles.infoText, { color: colors.text }]}>
              {blockReason ||
                "You are temporarily blocked from applying to this organizer."}
            </Text>
          </View>
        </View>
      )}

      {(() => {
        const canApplyAsSolo =
          musicianTypeRequired === "solo" || musicianTypeRequired === "both";
        const canApplyAsGroup =
          musicianTypeRequired === "group" || musicianTypeRequired === "both";
        const availableSlotTypes = requiredSlotTypes;

        if (!canApplyAsSolo && !hasGroups) {
          return (
            <View
              style={[
                styles.infoBox,
                {
                  backgroundColor: "#F59E0B20",
                  borderColor: "#F59E0B",
                  marginBottom: 16,
                },
              ]}
            >
              <Ionicons name="information-circle" size={20} color="#F59E0B" />
              <Text style={[styles.infoText, { color: colors.text }]}>
                This gig is looking for{" "}
                <Text style={{ fontFamily: "Poppins_600SemiBold" }}>
                  bands/groups only
                </Text>
                . Create a group first to apply.
              </Text>
            </View>
          );
        }

        const renderSlotTypeSelector = () => {
          if (availableSlotTypes.length === 0) return null;

          return (
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Preferred Slot</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 8 }}
              >
                {availableSlotTypes.map((slotType) => {
                  const isSelected = selectedSlotType === slotType;
                  const isDisabled = !getEnabledSlotTypes().includes(slotType);
                  const needed = slots?.[slotType]?.needed || 0;
                  const label =
                    slotType === "solo"
                      ? "Solo"
                      : slotType === "duo"
                        ? "Duo"
                        : "Band";

                  return (
                    <TouchableOpacity activeOpacity={1}
                      key={slotType}
                      style={[
                        styles.groupSelectChip,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : isDark
                              ? "#374151"
                              : "#F3F4F6",
                          borderColor: isSelected ? colors.primary : colors.border,
                          marginRight: 8,
                          opacity: isDisabled ? 0.45 : 1,
                        },
                      ]}
                      onPress={() => {
                        if (!isDisabled) {
                          setSelectedSlotType(slotType);
                        }
                      }}
                      disabled={isDisabled}
                    >
                      <Ionicons
                        name={slotType === "solo" ? "person" : "people"}
                        size={16}
                        color={isSelected ? "#FFF" : colors.text}
                      />
                      <Text
                        style={{
                          color: isSelected ? "#FFF" : colors.text,
                          marginLeft: 8,
                          fontFamily: "Poppins_500Medium",
                        }}
                      >
                        {label} ({needed})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {(availableSlotTypes.includes("duo") || availableSlotTypes.includes("band")) && (
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  {selectedSlotType === "duo" && !filteredGroups.length
                    ? "No Duo profile found. Create a Duo first."
                    : selectedSlotType === "band" && !filteredGroups.length
                      ? "No Band profile found. Create a Band first."
                      : "Choose a matching profile for the selected category."}
                </Text>
              )}
            </View>
          );
        };

        if (musicianTypeRequired === "solo") {
          return (
            <>
              {renderSlotTypeSelector()}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Apply as
                </Text>
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: colors.primary + "20",
                      borderColor: colors.primary,
                      marginBottom: 8,
                    },
                  ]}
                >
                  <Ionicons name="person" size={16} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.text }]}>
                    This gig is for{" "}
                    <Text style={{ fontFamily: "Poppins_600SemiBold" }}>
                      solo artists only
                    </Text>
                  </Text>
                </View>
              </View>
            </>
          );
        }

        if (musicianTypeRequired === "group" && hasGroups) {
          return (
            <>
              {renderSlotTypeSelector()}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Select Your Group *
                </Text>
                <View style={{ gap: 10 }}>
                  {filteredGroups.map((g) => {
                    const isSelected = selectedGroupId === g.id;
                    return (
                      <TouchableOpacity activeOpacity={1}
                        key={g.id}
                        onPress={() => setSelectedGroupId(g.id)}
                        activeOpacity={1}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected
                            ? isDark ? `${colors.primary}26` : `${colors.primary}14`
                            : isDark ? "#374151" : "#F9FAFB",
                        }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected ? colors.primary : isDark ? "#1F2937" : "#FFFFFF",
                            borderWidth: 1,
                            borderColor: isSelected ? colors.primary : colors.border,
                          }}
                        >
                          <Ionicons name="people" size={16} color={isSelected ? "#FFF" : colors.primary} />
                        </View>
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                            {g.name}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 }}>
                            {g.group_type === "duo" ? "Duo" : "Band"}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          );
        }

        if (hasGroups && canApplyAsGroup) {
          const applyOptions = [
            ...(canApplyAsSolo
              ? [{ id: null, name: "Individual", subtitle: "Apply as a solo artist", icon: "person" as const }]
              : []),
            ...filteredGroups.map((g) => ({
              id: g.id,
              name: g.name,
              subtitle: g.group_type === "duo" ? "Duo" : "Band",
              icon: "people" as const,
            })),
          ];

          return (
            <>
              {renderSlotTypeSelector()}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Apply as</Text>
                <View style={{ gap: 10 }}>
                  {applyOptions.map((opt) => {
                    const isSelected = selectedGroupId === opt.id;
                    return (
                      <TouchableOpacity activeOpacity={1}
                        key={opt.id ?? "__solo__"}
                        onPress={() => setSelectedGroupId(opt.id)}
                        activeOpacity={1}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected
                            ? isDark ? `${colors.primary}26` : `${colors.primary}14`
                            : isDark ? "#374151" : "#F9FAFB",
                        }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected ? colors.primary : isDark ? "#1F2937" : "#FFFFFF",
                            borderWidth: 1,
                            borderColor: isSelected ? colors.primary : colors.border,
                          }}
                        >
                          <Ionicons name={opt.icon} size={16} color={isSelected ? "#FFF" : colors.primary} />
                        </View>
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                            {opt.name}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 }}>
                            {opt.subtitle}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          );
        }

        return renderSlotTypeSelector();
      })()}

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Pitch Message</Text>
        <View
          style={[
            styles.inputWrapper,
            { backgroundColor: isDark ? "#374151" : "#F9FAFB", height: 100 },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.text, height: "100%" }]}
            placeholder="Why are you a good fit for this gig?"
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            value={pitchMessage}
            onChangeText={(text) => {
              debugLog("📝 Pitch message changed to:", text);
              setPitchMessage(text);
            }}
          />
        </View>
      </View>

      <DocumentUploader
        label="Upload CV/Resume"
        onFileSelect={(file) => setCvFile(file)}
        existingUrl={cvUrl || undefined}
      />

      <VideoUploader
        videoUrl={videoUrl}
        onVideoChange={(url) => setVideoUrl(url || "")}
        userId={userId || ""}
        bucketName="documents"
        folder="performance-videos"
        maxSizeMB={50}
      />

      {group?.contract_url ? (
        <TouchableOpacity activeOpacity={1}
          onPress={() => Linking.openURL(group.contract_url)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 24,
          }}
          activeOpacity={1}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <Text
            style={{
              color: colors.primary,
              marginLeft: 8,
              textDecorationLine: "underline",
              fontFamily: "Poppins_500Medium",
            }}
          >
            Review Terms & Conditions
          </Text>
          <Ionicons
            name="open-outline"
            size={14}
            color={colors.primary}
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 24,
            opacity: 0.5,
          }}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
          <Text
            style={{
              color: colors.textSecondary,
              marginLeft: 8,
              fontFamily: "Poppins_400Regular",
            }}
          >
            No Terms & Conditions uploaded
          </Text>
        </View>
      )}

      {groupAlreadyApplied && selectedGroupId && (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: "#F59E0B20",
              borderColor: "#F59E0B",
              marginBottom: 16,
            },
          ]}
        >
          <Ionicons name="warning" size={20} color="#F59E0B" />
          <Text style={[styles.infoText, { color: colors.text }]}>
            This group has already applied via{" "}
            <Text style={{ fontFamily: "Poppins_600SemiBold" }}>{groupApplicationBy}</Text>
            . Only one application per group is allowed.
          </Text>
        </View>
      )}

      <TouchableOpacity activeOpacity={1}
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          (isSubmittingApplication ||
            !pitchMessage.trim() ||
            !videoUrl ||
            groupAlreadyApplied ||
            (group.requirements?.musician_type === "group" && !selectedGroupId)) &&
            { opacity: 0.5 },
        ]}
        onPress={() => {
          debugLog("🟡 SUBMIT APPLICATION BUTTON PRESSED - Validating...");
          handleSubmitApplication();
        }}
        disabled={
          isSubmittingApplication ||
          hasExistingApplication ||
          isBlocked ||
          groupAlreadyApplied ||
          (group.requirements?.musician_type === "group" && !selectedGroupId)
        }
        activeOpacity={1}
      >
        {isSubmittingApplication ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {hasExistingApplication
              ? existingApplicationStatus === "rejected"
                ? "Application Declined"
                : existingApplicationStatus === "accepted" ||
                    existingApplicationStatus === "approved"
                  ? "Application Accepted"
                  : "Already Applied"
              : groupAlreadyApplied
                ? "Group Already Applied"
                : group.requirements?.musician_type === "group" && !selectedGroupId
                  ? "Select a Group to Apply"
                  : "Submit Application"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default GigApplyTab;

