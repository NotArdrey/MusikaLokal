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
  GroupInviteTarget,
  searchGroupInviteTargets,
} from "../utils/groupMemberInvites";

type GroupInviteSectionProps = {
  currentUserId?: string | null;
  groupId?: string | null;
  selectedTargets: GroupInviteTarget[];
  onSelectedTargetsChange: (targets: GroupInviteTarget[]) => void;
  inviteMessage: string;
  onInviteMessageChange: (value: string) => void;
  excludedUserIds?: string[];
  disabled?: boolean;
};

export default function GroupInviteSection({
  currentUserId,
  groupId,
  selectedTargets,
  onSelectedTargetsChange,
  inviteMessage,
  onInviteMessageChange,
  excludedUserIds = [],
  disabled = false,
}: GroupInviteSectionProps) {
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GroupInviteTarget[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const selectedKeys = useMemo(
    () => new Set(selectedTargets.map((target) => target.key)),
    [selectedTargets],
  );
  const excludedUserIdSet = useMemo(
    () => new Set(excludedUserIds.filter(Boolean)),
    [excludedUserIds],
  );

  const visibleResults = useMemo(
    () =>
      searchResults.filter(
        (target) => !selectedKeys.has(target.key) && !excludedUserIdSet.has(target.id),
      ),
    [excludedUserIdSet, searchResults, selectedKeys],
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
        const results = await searchGroupInviteTargets({
          currentUserId,
          groupId,
          searchQuery: normalizedQuery,
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
  }, [currentUserId, groupId, searchQuery]);

  const addTarget = (target: GroupInviteTarget) => {
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
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Invite Members</Text>
      <Text style={[styles.sectionText, { color: colors.textSecondary }]}>Search musicians and send invites. Accepted invites add the musician to this group, and recipients can respond from Bookings &gt; Pending.</Text>

      <Text style={[styles.label, { color: colors.text }]}>Search Musicians</Text>
      <View style={[styles.searchInputWrap, { backgroundColor: isDark ? "#374151" : "#F3F4F6" }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search musician by name"
          placeholderTextColor={colors.textSecondary}
          editable={!disabled}
        />
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
              <TouchableOpacity
                activeOpacity={disabled ? 1 : 0.78}
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
          <Text style={[styles.searchStateText, { color: colors.textSecondary }]}>Searching musicians...</Text>
        </View>
      ) : searchError ? (
        <Text style={[styles.searchStateText, { color: "#EF4444" }]}>{searchError}</Text>
      ) : searchQuery.trim().length >= 2 && visibleResults.length === 0 ? (
        <Text style={[styles.searchStateText, { color: colors.textSecondary }]}>No matching musicians found.</Text>
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
              <TouchableOpacity
                activeOpacity={disabled ? 1 : 0.78}
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
        placeholder="Add optional context for the invite"
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
    borderRadius: 16,
    padding: 16,
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
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    height: 24,
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
    padding: 0,
    textAlignVertical: "center",
    fontFamily: "Poppins_500Medium",
  },
  selectedList: {
    marginTop: 14,
    gap: 10,
  },
  selectedItem: {
    borderWidth: 1,
    borderRadius: 12,
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
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  messageInput: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
});
