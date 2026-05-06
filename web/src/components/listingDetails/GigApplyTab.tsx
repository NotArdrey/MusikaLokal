import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ActivityIndicator,
    Modal as RNModal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { PH_MUSIC_GROUP_TYPES } from "../../constants/groupTypes";
import { getGigApplicationDeadlineInfo } from "../../utils/gigApplication";
import DocumentUploader from "../DocumentUploader";
import InAppMediaViewer from "../InAppMediaViewer";
import styles from "../ListingDetailsSheet.styles";
import VideoUploader from "../VideoUploader";

const debugLog = (..._args: unknown[]) => {};

interface GigApplyTabProps {
  colors: any;
  isDark: boolean;
  group: any;
  applicationContext?: "gig" | "group";
  userId: string | null;
  userRole?: string | null;
  pitchMessage: string;
  setPitchMessage: (value: string) => void;
  cvFile: any;
  cvUrl: string;
  setCvFile: (file: any) => void;
  setCvUrl: (value: string) => void;
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
  productionTeams: any[];
  loadingProductionTeams: boolean;
  selectedProductionTeamId: string | null;
  setSelectedProductionTeamId: (value: string | null) => void;
  productionRoster: any[];
  selectedProductionRosterId: string | null;
  setSelectedProductionRosterId: (value: string | null) => void;
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
  applicationContext = "gig",
  userId,
  userRole,
  pitchMessage,
  setPitchMessage,
  cvFile,
  cvUrl,
  setCvFile,
  setCvUrl,
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
  productionTeams,
  loadingProductionTeams,
  selectedProductionTeamId,
  setSelectedProductionTeamId,
  productionRoster,
  selectedProductionRosterId,
  setSelectedProductionRosterId,
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

  const [isSystemTermsAccepted, setIsSystemTermsAccepted] = React.useState(false);
  const [isCustomContractAccepted, setIsCustomContractAccepted] = React.useState(false);
  const [mediaViewerUrl, setMediaViewerUrl] = React.useState<string | null>(null);
  const [termsVisible, setTermsVisible] = React.useState(false);
  const isGroupApplicationFlow = applicationContext === "group";
  const isProducerFlow = !isGroupApplicationFlow && userRole === "producer";
  const hasCustomContract = !isGroupApplicationFlow && Boolean(group?.contract_url);
  const musicianTypeRequired = group?.requirements?.musician_type || "both";
  const hasGroups = userGroups.length > 0;
  const selectedProductionTeam = productionTeams.find((team) => team.id === selectedProductionTeamId) || null;
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

  const getProductionRosterGroupType = (entry: any) => {
    if (!entry) return null;
    if (entry.group_type) return entry.group_type;
    if (entry.group?.group_type) return entry.group.group_type;
    if (entry.entity_kind === "duo") return "duo";
    if (entry.entity_kind === "group") return "band";
    return null;
  };

  const filteredProductionRoster = productionRoster.filter((entry) => {
    const entryGroupType = getProductionRosterGroupType(entry);

    if (selectedSlotType === "solo") return entry.entity_kind === "musician";
    if (selectedSlotType === "duo") return entryGroupType === "duo";
    if (selectedSlotType === "band") return entryGroupType === "band";
    return true;
  });

  const getEnabledSlotTypes = () => {
    if (requiredSlotTypes.length === 0) return [] as ("solo" | "duo" | "band")[];

    return requiredSlotTypes.filter((slotType) => {
      if (musicianTypeRequired === "solo" && slotType !== "solo") return false;
      if (musicianTypeRequired === "group" && slotType === "solo") return false;
      if (isProducerFlow) {
        if (slotType === "solo") return productionRoster.some((entry) => entry.entity_kind === "musician");
        if (slotType === "duo") return productionRoster.some((entry) => getProductionRosterGroupType(entry) === "duo");
        if (slotType === "band") return productionRoster.some((entry) => getProductionRosterGroupType(entry) === "band");
        return true;
      }
      if (slotType === "duo" && !userGroups.some((g) => isDuoType(g))) return false;
      if (slotType === "band" && !userGroups.some((g) => isBandType(g))) return false;
      return true;
    });
  };

  const selectedSlotRequirements = React.useMemo(() => {
    if (!selectedSlotType) return null;
    const slot = slots?.[selectedSlotType] || {};
    const preferredGenres = Array.isArray(slot.preferred_genres)
      ? slot.preferred_genres.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const preferredInstruments = Array.isArray(slot.preferred_instruments)
      ? slot.preferred_instruments.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const preferredGroupTypesRaw = selectedSlotType === "band" && Array.isArray(slot.preferred_group_types)
      ? slot.preferred_group_types.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    const preferredGroupTypeLabels = [...preferredGroupTypesRaw.reduce((map: Map<string, number>, typeId: string) => {
        map.set(typeId, (map.get(typeId) || 0) + 1);
        return map;
      }, new Map<string, number>()).entries()].map(([typeId, count]) => {
      const label = PH_MUSIC_GROUP_TYPES.find((entry) => entry.id === typeId)?.label || "Group";
      return count > 1 ? `${label} (${count})` : label;
    });

    return {
      preferredGenres,
      preferredInstruments,
      preferredGroupTypeLabels,
    };
  }, [selectedSlotType, slots]);

  React.useEffect(() => {
    if (!selectedGroupId) return;
    const stillVisible = filteredGroups.some((g) => g.id === selectedGroupId);
    if (!stillVisible) {
      setSelectedGroupId(null);
    }
  }, [filteredGroups, selectedGroupId, setSelectedGroupId]);

  React.useEffect(() => {
    if (!selectedProductionRosterId) return;
    const stillVisible = filteredProductionRoster.some((entry) => entry.id === selectedProductionRosterId);
    if (!stillVisible) {
      setSelectedProductionRosterId(null);
    }
  }, [filteredProductionRoster, selectedProductionRosterId, setSelectedProductionRosterId]);

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

  const requiresGroupSelection =
    !isGroupApplicationFlow &&
    !isProducerFlow &&
    group.requirements?.musician_type === "group" &&
    !selectedGroupId;
  const requiresProductionSelection =
    isProducerFlow && (!selectedProductionTeamId || !selectedProductionRosterId);
  const isApplicationsClosed = isGroupApplicationFlow
    ? group?.open_group_applications !== true
    : Boolean(getGigApplicationDeadlineInfo(group)?.isPassed);
  const isPitchMissing = !pitchMessage.trim();
  const isCvMissing = !cvFile && !cvUrl;
  const isVideoMissing = !(videoUrl || "").trim();
  const isTermsIncomplete = !isGroupApplicationFlow && (!isSystemTermsAccepted || (hasCustomContract && !isCustomContractAccepted));
  const isFormIncomplete =
    isPitchMissing ||
    isCvMissing ||
    isVideoMissing ||
    requiresGroupSelection ||
    requiresProductionSelection ||
    isApplicationsClosed ||
    isTermsIncomplete;
  const isSubmitDisabled =
    isSubmittingApplication ||
    hasExistingApplication ||
    isBlocked ||
    groupAlreadyApplied ||
    isFormIncomplete;

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

      {!isGroupApplicationFlow && (() => {
        const canApplyAsSolo =
          musicianTypeRequired === "solo" || musicianTypeRequired === "both";
        const canApplyAsGroup =
          musicianTypeRequired === "group" || musicianTypeRequired === "both";
        const availableSlotTypes = requiredSlotTypes;

        if (!isProducerFlow && !canApplyAsSolo && !hasGroups) {
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

              {selectedSlotRequirements &&
                (selectedSlotRequirements.preferredGenres.length > 0 ||
                  selectedSlotRequirements.preferredInstruments.length > 0 ||
                  selectedSlotRequirements.preferredGroupTypeLabels.length > 0) && (
                  <View
                    style={[
                      styles.infoBox,
                      {
                        backgroundColor: isDark ? "#374151" : "#F9FAFB",
                        borderColor: colors.border,
                        marginTop: 8,
                      },
                    ]}
                  >
                    {selectedSlotRequirements.preferredGroupTypeLabels.length > 0 && (
                      <Text style={[styles.infoText, { color: colors.text }]}>
                        <Text style={{ fontFamily: "Poppins_600SemiBold" }}>Preferred group types: </Text>
                        {selectedSlotRequirements.preferredGroupTypeLabels.join(", ")}
                      </Text>
                    )}
                    {selectedSlotRequirements.preferredGenres.length > 0 && (
                      <Text style={[styles.infoText, { color: colors.text }]}>
                        <Text style={{ fontFamily: "Poppins_600SemiBold" }}>Preferred genres: </Text>
                        {selectedSlotRequirements.preferredGenres.join(", ")}
                      </Text>
                    )}
                    {selectedSlotRequirements.preferredInstruments.length > 0 && (
                      <Text style={[styles.infoText, { color: colors.text }]}>
                        <Text style={{ fontFamily: "Poppins_600SemiBold" }}>Preferred instruments: </Text>
                        {selectedSlotRequirements.preferredInstruments.join(", ")}
                      </Text>
                    )}
                  </View>
                )}
            </View>
          );
        };

        if (isProducerFlow) {
          return (
            <>
              {renderSlotTypeSelector()}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Select Production Team *</Text>
                {loadingProductionTeams ? (
                  <View style={{ paddingVertical: 12 }}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : productionTeams.length === 0 ? (
                  <View
                    style={[
                      styles.infoBox,
                      {
                        backgroundColor: "#F59E0B20",
                        borderColor: "#F59E0B",
                      },
                    ]}
                  >
                    <Ionicons name="information-circle" size={20} color="#F59E0B" />
                    <Text style={[styles.infoText, { color: colors.text }]}>Create a production team first, then add musicians, duos, or groups to its roster before applying.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {productionTeams.map((team) => {
                      const isSelected = selectedProductionTeamId === team.id;
                      return (
                        <TouchableOpacity activeOpacity={1}
                          key={team.id}
                          onPress={() => setSelectedProductionTeamId(team.id)}
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
                            <Ionicons name="briefcase" size={16} color={isSelected ? "#FFF" : colors.primary} />
                          </View>
                          <View style={{ marginLeft: 12, flex: 1 }}>
                            <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                              {team.name}
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 }}>
                              {team.member_role === "owner" ? "Owner" : team.member_role === "manager" ? "Manager" : "Team member"}
                            </Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {selectedProductionTeam && (
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Select Performer From {selectedProductionTeam.name} *</Text>
                  {filteredProductionRoster.length === 0 ? (
                    <View
                      style={[
                        styles.infoBox,
                        {
                          backgroundColor: isDark ? "#374151" : "#F9FAFB",
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Ionicons name="albums-outline" size={18} color={colors.textSecondary} />
                      <Text style={[styles.infoText, { color: colors.text }]}>No matching roster entry is available for the selected slot. Add a musician, duo, or group to this production team first.</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {filteredProductionRoster.map((entry) => {
                        const isSelected = selectedProductionRosterId === entry.id;
                        const entryType = entry.entity_kind === "musician"
                          ? "Musician"
                          : getProductionRosterGroupType(entry) === "duo"
                            ? "Duo"
                            : "Group";

                        return (
                          <TouchableOpacity activeOpacity={1}
                            key={entry.id}
                            onPress={() => setSelectedProductionRosterId(entry.id)}
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
                              <Ionicons name={entry.entity_kind === "musician" ? "person" : "people"} size={16} color={isSelected ? "#FFF" : colors.primary} />
                            </View>
                            <View style={{ marginLeft: 12, flex: 1 }}>
                              <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                                {entry.display_name}
                              </Text>
                              <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 }}>
                                {entryType}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </>
          );
        }

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
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {isGroupApplicationFlow ? "Application Message" : "Pitch Message"}
        </Text>
        <View
          style={[
            styles.inputWrapper,
            { backgroundColor: isDark ? "#374151" : "#F9FAFB", height: 100 },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.text, height: "100%" }]}
            placeholder={
              isGroupApplicationFlow
                ? "Tell the group why you are a good fit."
                : "Why are you a good fit for this gig?"
            }
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

      {!isGroupApplicationFlow && (
        <View style={{ marginBottom: 24, gap: 12 }}>
          {hasCustomContract && (
            <TouchableOpacity activeOpacity={1}
              onPress={() => setIsCustomContractAccepted((prev) => !prev)}
              style={gigApplyStyles.termsRow}
            >
              <View style={[gigApplyStyles.checkbox, {
                borderColor: isCustomContractAccepted ? colors.primary : colors.border,
                backgroundColor: isCustomContractAccepted ? colors.primary : 'transparent',
              }]}>
                {isCustomContractAccepted && <Text style={gigApplyStyles.checkboxTick}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[gigApplyStyles.termsText, { color: colors.text }]}>
                  I have read and agree to{' '}
                  <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>{group?.name || 'the organizer'}'s</Text>
                  {' '}custom contract. *
                </Text>
                <TouchableOpacity activeOpacity={1} onPress={() => setMediaViewerUrl(group.contract_url)} style={{ marginTop: 4 }}>
                  <Text style={[gigApplyStyles.termsLink, { color: colors.primary }]}>View Custom Contract</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          <View style={gigApplyStyles.termsRow}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setIsSystemTermsAccepted((prev) => !prev)}
              style={[gigApplyStyles.checkbox, {
              borderColor: isSystemTermsAccepted ? colors.primary : colors.border,
              backgroundColor: isSystemTermsAccepted ? colors.primary : 'transparent',
            }]}>
              {isSystemTermsAccepted && <Text style={gigApplyStyles.checkboxTick}>✓</Text>}
            </TouchableOpacity>
            <Text style={[gigApplyStyles.termsText, { color: colors.text }]}>
              I agree to Musika Lokal's{' '}
              <Text
                onPress={() => setTermsVisible(true)}
                style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary, textDecorationLine: 'underline' }}
              >
                Terms and Conditions
              </Text>. *
            </Text>
          </View>
        </View>
      )}

      {!isGroupApplicationFlow && groupAlreadyApplied && selectedGroupId && (
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

      <TouchableOpacity activeOpacity={isSubmitDisabled ? 1 : 0.78}
        style={[
          styles.primaryBtn,
          {
            backgroundColor: isSubmitDisabled ? colors.border : colors.primary,
            opacity: isSubmitDisabled ? 0.6 : 1,
          },
        ]}
        onPress={() => {
          debugLog("🟡 SUBMIT APPLICATION BUTTON PRESSED - Validating...");
          handleSubmitApplication();
        }}
        disabled={isSubmitDisabled}
      >
        {isSubmittingApplication ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.primaryBtnText, { color: isSubmitDisabled ? colors.textSecondary : "#FFFFFF" }]}>
            {hasExistingApplication
              ? existingApplicationStatus === "rejected"
                ? "Application Declined"
                : existingApplicationStatus === "accepted" ||
                    existingApplicationStatus === "approved"
                  ? "Application Accepted"
                  : "Already Applied"
              : groupAlreadyApplied
                ? "Group Already Applied"
                : isApplicationsClosed
                  ? "Applications Closed"
                : requiresProductionSelection
                  ? "Select Team and Performer"
                : requiresGroupSelection
                  ? "Select a Group to Apply"
                  : isPitchMissing || isCvMissing || isVideoMissing
                    ? "Complete Required Fields"
                  : "Submit Application"}
          </Text>
        )}
      </TouchableOpacity>

      <InAppMediaViewer
        visible={!!mediaViewerUrl}
        uri={mediaViewerUrl}
        title="Custom Contract"
        onClose={() => setMediaViewerUrl(null)}
      />

      <RNModal
        animationType="slide"
        transparent
        visible={termsVisible}
        onRequestClose={() => setTermsVisible(false)}
      >
        <View style={gigApplyStyles.termsOverlay}>
          <View style={[gigApplyStyles.termsModal, { backgroundColor: colors.card }]}>
            <View style={gigApplyStyles.termsModalHeader}>
              <Text style={[gigApplyStyles.termsModalTitle, { color: colors.text }]}>Terms and Conditions</Text>
              <TouchableOpacity activeOpacity={1} onPress={() => setTermsVisible(false)}>
                <Text style={[gigApplyStyles.termsCloseText, { color: colors.primary }]}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={gigApplyStyles.termsModalBody}>
              <Text style={[gigApplyStyles.termsSectionTitle, { color: colors.text }]}>1. Booking and Payments</Text>
              <Text style={[gigApplyStyles.termsBody, { color: colors.textSecondary }]}>All transactions are processed through the Musika Lokal Wallet. Funds may be held in escrow and released after completion if no dispute is raised.</Text>

              <Text style={[gigApplyStyles.termsSectionTitle, { color: colors.text }]}>2. Cancellations</Text>
              <Text style={[gigApplyStyles.termsBody, { color: colors.textSecondary }]}>Cancellation rules, refunds, and force majeure exceptions follow the current Musika Lokal policy shown in the full terms page.</Text>

              <Text style={[gigApplyStyles.termsSectionTitle, { color: colors.text }]}>3. User Conduct</Text>
              <Text style={[gigApplyStyles.termsBody, { color: colors.textSecondary }]}>Users must not bypass platform payments, harass others, submit fraudulent information, or upload content they do not have permission to use.</Text>

              <Text style={[gigApplyStyles.termsSectionTitle, { color: colors.text }]}>4. Liability</Text>
              <Text style={[gigApplyStyles.termsBody, { color: colors.textSecondary }]}>Musika Lokal acts as a facilitator and is not liable for personal injury, property damage, external payment network failures, or loss of income due to app downtime.</Text>

              <Text style={[gigApplyStyles.termsSectionTitle, { color: colors.text }]}>5. Governing Law</Text>
              <Text style={[gigApplyStyles.termsBody, { color: colors.textSecondary }]}>These terms are governed by the laws of the Republic of the Philippines.</Text>
            </ScrollView>
          </View>
        </View>
      </RNModal>
    </View>
  );
};

const gigApplyStyles = StyleSheet.create({
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    lineHeight: 14,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 20,
  },
  termsLink: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    textDecorationLine: 'underline',
  },
  termsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  termsModal: {
    width: '100%',
    maxHeight: '82%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  termsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  termsModalTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  termsCloseText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  termsModalBody: {
    paddingBottom: 18,
  },
  termsSectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    marginTop: 12,
    marginBottom: 6,
  },
  termsBody: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
});

export default GigApplyTab;

