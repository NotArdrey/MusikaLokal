import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { supabase } from "../../../lib/supabase";

interface GigInfoTabProps {
  group: any;
  colors: any;
  isDark: boolean;
  styles: any;
}

const GigInfoTab = ({ group, colors, isDark, styles }: GigInfoTabProps) => {
  const [featuredPerformers, setFeaturedPerformers] = useState<any[]>([]);
  const requirements = group.requirements || {};
  const audioSetup =
    requirements.audio || requirements.sound_system || "Standard PA";

  const techSpecs = [] as string[];
  if (requirements.lighting) techSpecs.push(`Lighting: ${requirements.lighting}`);
  if (requirements.stage_size) techSpecs.push(`Stage Size: ${requirements.stage_size}`);
  if (requirements.backline) techSpecs.push(`Backline: ${requirements.backline}`);
  if (requirements.sound_check) techSpecs.push("Sound Check Available");
  if (requirements.green_room) techSpecs.push("Green Room Available");

  if (techSpecs.length === 0 && group.amenities?.length > 0) {
    group.amenities.forEach((amenity: string) => techSpecs.push(amenity));
  }

  useEffect(() => {
    let isActive = true;
    const loadFeaturedPerformers = async () => {
      if (!group?.id) {
        setFeaturedPerformers([]);
        return;
      }
      const { data, error } = await supabase.rpc("get_gig_featured_performers", { p_gig_id: group.id });
      if (isActive) setFeaturedPerformers(error ? [] : Array.isArray(data) ? data : []);
    };
    loadFeaturedPerformers();
    return () => { isActive = false; };
  }, [group?.id]);

  return (
    <View style={styles.tabContent}>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <View
          style={[
            styles.infoCard,
            { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
          ]}
        >
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Audio</Text>
          <Text
            style={[styles.infoValue, { color: colors.text, fontSize: 13 }]}
            numberOfLines={2}
          >
            {audioSetup}
          </Text>
        </View>
      </View>

      {requirements.experience_level && (
        <View style={[styles.section, { marginTop: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
            <Text
              style={{
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
                fontSize: 14,
              }}
            >
              Experience Level: <Text style={{ color: colors.primary }}>{requirements.experience_level}</Text>
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.section, { marginTop: 24 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Event Details</Text>
        {group.event_date && (
          <View style={styles.checkRow}>
            <Ionicons name="calendar" size={20} color={colors.primary} />
            <Text style={{ color: colors.text, marginLeft: 12 }}>
              {new Date(group.event_date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        )}
        {group.location && (
          <View style={styles.checkRow}>
            <Ionicons name="location" size={20} color={colors.primary} />
            <Text style={{ color: colors.text, marginLeft: 12 }}>{group.location}</Text>
          </View>
        )}
      </View>

      {featuredPerformers.length > 0 ? (
        <View style={[styles.section, { marginTop: 24 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Ionicons name="people-circle-outline" size={22} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Featured Accepted Performers</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17, marginBottom: 10 }}>
            These performers gave permission to appear on this gig page.
          </Text>
          {featuredPerformers.map((performer) => (
            <View
              key={performer.application_id}
              style={{ flexDirection: "row", alignItems: "center", gap: 11, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 11 }}
            >
              {performer.avatar_url ? (
                <Image source={{ uri: performer.avatar_url }} style={{ width: 42, height: 42, borderRadius: 21 }} />
              ) : (
                <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: isDark ? "#374151" : "#E5E7EB" }}>
                  <Ionicons name="musical-notes" size={19} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>{performer.display_name}</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 10 }}>
                  {performer.entity_type === "group" ? "Accepted group" : "Accepted musician"}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={19} color="#10B981" />
            </View>
          ))}
        </View>
      ) : null}

      {techSpecs.length > 0 && (
        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tech Specs & Amenities</Text>
          {techSpecs.map((spec: string, i: number) => (
            <View key={i} style={styles.checkRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, marginLeft: 12 }}>{spec}</Text>
            </View>
          ))}
        </View>
      )}

      {techSpecs.length === 0 && !group.event_date && (
        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            No additional specifications provided.
          </Text>
        </View>
      )}
    </View>
  );
};

export default GigInfoTab;
