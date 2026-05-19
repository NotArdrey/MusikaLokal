import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CachedImage from "./CachedImage";
import { useTheme } from "../context/ThemeContext";
import {
  ProductionInviteFilter,
  ProductionInviteTarget,
  searchProductionInviteTargets,
} from "../utils/productionTeamInvites";

type ProductionInviteSectionProps = {
  currentUserId?: string | null;
  selectedTargets: ProductionInviteTarget[];
  onSelectedTargetsChange: (targets: ProductionInviteTarget[]) => void;
  inviteMessage: string;
  onInviteMessageChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
  searchPlaceholder?: string;
  messagePlaceholder?: string;
};

const FILTER_OPTIONS: { value: ProductionInviteFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "musician", label: "Musicians" },
  { value: "duo", label: "Duos" },
  { value: "group", label: "Groups" },
];

export default function ProductionInviteSection({
  currentUserId,
  selectedTargets,
  onSelectedTargetsChange,
  inviteMessage,
  onInviteMessageChange,
  disabled = false,
  title = "Invite Musicians, Duo, or Group",
  description = "Search for performers to invite after you save this production team. Accepted invites will add them to your production roster, and recipients can respond from Bookings > Pending.",
  searchPlaceholder = "Search musician",
  messagePlaceholder = "Add optional context for the invite",
}: ProductionInviteSectionProps) {
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ProductionInviteFilter>("all");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductionInviteTarget[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const selectedKeys = useMemo(
    () => new Set(selectedTargets.map((target) => target.key)),
    [selectedTargets],
  );

  const visibleResults = useMemo(
    () => searchResults.filter((target) => !selectedKeys.has(target.key)),
    [searchResults, selectedKeys],
  );

  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      try {
        setSearching(true);
        setSearchError(null);
        const results = await searchProductionInviteTargets({
          currentUserId,
          searchQuery: normalizedQuery,
          filter: activeFilter,
        });

        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (error: any) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(error?.message || "Search failed.");
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeFilter, currentUserId, searchQuery]);

  const addTarget = (target: ProductionInviteTarget) => {
    if (selectedKeys.has(target.key)) {
      return;
    }

    onSelectedTargetsChange([...selectedTargets, target]);
  };

  const removeTarget = (targetKey: string) => {
    onSelectedTargetsChange(
      selectedTargets.filter((target) => target.key !== targetKey),
    );
  };

  return (
    <View style={[styles.sectionCard, { borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sectionText, { color: colors.textSecondary }]}>{description}</Text>

      <Text style={[styles.label, { color: colors.text }]}>Search Talent</Text>
      <View style={[styles.searchInputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textSecondary}
          editable={!disabled}
        />
      </View>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => {
          const isActive = activeFilter === option.value;
          return (
            <TouchableOpacity activeOpacity={disabled ? 1 : 0.78}
              key={option.value}
              onPress={() => setActiveFilter(option.value)}
              disabled={disabled}
              style={[
                styles.filterChip,
                {
                  borderColor: isActive ? colors.primary : colors.border,
                  backgroundColor: isActive ? colors.primary : "transparent",
                  opacity: disabled ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: isActive ? "#fff" : colors.textSecondary }]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedTargets.length > 0 ? (
        <View style={styles.selectedList}>
          {selectedTargets.map((target) => (
            <View key={target.key} style={[styles.selectedItem, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={styles.selectedItemInfo}>
                {target.image ? (
                  <CachedImage uri={target.image} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.primary + "18" }]}>
                    <Ionicons name="person-outline" size={16} color={colors.primary} />
                  </View>
                )}
                <View style={styles.selectedTextWrap}>
                  <Text style={[styles.selectedName, { color: colors.text }]} numberOfLines={1}>
                    {target.displayName}
                  </Text>
                  <Text style={[styles.selectedSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {target.subtitle}
                  </Text>
                </View>
              </View>
              <TouchableOpacity activeOpacity={disabled ? 1 : 0.78}
                onPress={() => removeTarget(target.key)}
                disabled={disabled}
                style={styles.removeBtn}
              >
                <Ionicons name="close-circle" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {searching ? (
        <View style={styles.searchStateRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.searchStateText, { color: colors.textSecondary }]}>Searching talent...</Text>
        </View>
      ) : searchError ? (
        <Text style={[styles.searchStateText, { color: "#EF4444" }]}>{searchError}</Text>
      ) : searchQuery.trim().length >= 2 && visibleResults.length === 0 ? (
        <Text style={[styles.searchStateText, { color: colors.textSecondary }]}>No matching musicians, duos, or groups found.</Text>
      ) : null}

      {visibleResults.length > 0 ? (
        <View style={styles.resultsList}>
          {visibleResults.map((target) => (
            <View key={target.key} style={[styles.resultItem, { borderColor: colors.border }]}>
              <View style={styles.selectedItemInfo}>
                {target.image ? (
                  <CachedImage uri={target.image} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.primary + "18" }]}>
                    <Ionicons name={target.kind === "musician" ? "person-outline" : "people-outline"} size={16} color={colors.primary} />
                  </View>
                )}
                <View style={styles.selectedTextWrap}>
                  <Text style={[styles.selectedName, { color: colors.text }]} numberOfLines={1}>
                    {target.displayName}
                  </Text>
                  <Text style={[styles.selectedSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {target.subtitle}
                  </Text>
                </View>
              </View>
              <TouchableOpacity activeOpacity={disabled ? 1 : 0.78}
                onPress={() => addTarget(target)}
                disabled={disabled}
                style={[styles.addBtn, { backgroundColor: colors.primary, opacity: disabled ? 0.6 : 1 }]}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>Invite Message</Text>
      <TextInput
        style={[styles.messageInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        value={inviteMessage}
        onChangeText={onInviteMessageChange}
        placeholder={messagePlaceholder}
        placeholderTextColor={colors.textSecondary}
        editable={!disabled}
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  sectionText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  label: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    lineHeight: 22,
    padding: 0,
    textAlignVertical: "center",
    fontFamily: "Poppins_400Regular",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  selectedList: {
    marginTop: 14,
    gap: 10,
  },
  selectedItem: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  selectedItemInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedTextWrap: {
    flex: 1,
  },
  selectedName: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  selectedSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    padding: 2,
  },
  searchStateRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchStateText: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  resultsList: {
    marginTop: 12,
    gap: 10,
  },
  resultItem: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  messageInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 96,
    textAlignVertical: "top",
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
});
