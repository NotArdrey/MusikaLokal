import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { buildGigTimeline, getGigTimelineLabel } from "../../utils/gigTimeline";

interface GroupTimelineTabProps {
  group: any;
  colors: any;
  isDark: boolean;
  styles: any;
  width: number;
}

const GroupTimelineTab = ({
  group,
  colors,
  isDark,
  styles,
  width,
}: GroupTimelineTabProps) => {
  const [loading, setLoading] = useState(true);
  const [gigs, setGigs] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchGroupGigs = async () => {
      if (!group?.id) {
        setLoading(false);
        setGigs([]);
        return;
      }

      setLoading(true);
      try {
        const isArtistProfile = String(group?.type || "").toLowerCase() === "artist";
        const { data, error } = await supabase.rpc('get_public_performer_gig_timeline', {
          p_target_id: group.id, p_target_type: isArtistProfile ? 'artist' : 'group',
        });

        if (cancelled) return;
        if (error) throw error;

        const gigMap = new Map<string, any>();
        (data || []).forEach((application: any) => {
          const gig = application?.gigs;
          if (!gig?.id) return;
          if (!gigMap.has(gig.id)) {
            gigMap.set(gig.id, { ...gig, application_status: application.status });
          }
        });

        setGigs(Array.from(gigMap.values()));
      } catch {
        if (cancelled) return;
        setGigs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchGroupGigs();
    return () => { cancelled = true; };
  }, [group?.id, group?.type]);

  const groupedGigs = useMemo(
    () => buildGigTimeline(gigs.map((gig) => ({ gigs: gig, status: gig.application_status }))),
    [gigs],
  );

  const renderGigCard = (gig: any, accent: string) => {
    const eventDate = gig?.event_date
      ? new Date(gig.event_date).toLocaleDateString("en-US", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      : "Date TBA";

    return (
      <View
        key={gig.id}
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ flex: 1, color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 15 }}>
            {gig.name || "Untitled Gig"}
          </Text>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: `${accent}20`,
            }}
          >
            <Text style={{ color: accent, fontFamily: "Poppins_600SemiBold", fontSize: 11 }}>
              {getGigTimelineLabel(gig).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12 }}>
            {eventDate}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12 }} numberOfLines={1}>
            {gig.location || "Location TBA"}
          </Text>
        </View>


      </View>
    );
  };

  const renderSection = (
    title: string,
    icon: keyof typeof Ionicons.glyphMap,
    items: any[],
    accent: string,
  ) => (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Ionicons name={icon} size={16} color={accent} />
        <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 15 }}>
          {title} ({items.length})
        </Text>
      </View>
      {items.length > 0 ? (
        <View style={{ gap: 10 }}>{items.map((gig) => renderGigCard(gig, accent))}</View>
      ) : (
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.border,
            padding: 14,
            backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
          }}
        >
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12 }}>
            No {title.toLowerCase()} gigs yet.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {String(group?.type || "").toLowerCase() === "artist" ? "Gig Timeline" : "Group Gig Timeline"}
        </Text>

        {loading ? (
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium", fontSize: 13 }}>
            Loading gigs...
          </Text>
        ) : gigs.length > 0 ? (
          <View>
            {renderSection("Active", "flash-outline", groupedGigs.active, "#10B981")}
            {renderSection("Upcoming", "calendar-outline", groupedGigs.upcoming, "#3B82F6")}
            {renderSection("Done", "checkmark-done-outline", groupedGigs.done, "#6B7280")}
          </View>
        ) : (
          <View
            style={{
              padding: 40,
              alignItems: "center",
              backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: "dashed",
            }}
          >
            <Ionicons
              name="images-outline"
              size={48}
              color={colors.textSecondary}
            />
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 12,
                fontFamily: "Poppins_500Medium",
                fontSize: 14,
              }}
            >
              No timeline gigs yet
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 4,
                fontFamily: "Poppins_400Regular",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              Accepted group gigs will appear here with full details
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default GroupTimelineTab;
