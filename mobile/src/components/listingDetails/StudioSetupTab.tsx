import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import CachedImage from "../CachedImage";

interface StudioSetupTabProps {
  group: any;
  colors: any;
  isDark: boolean;
  styles: any;
}

const StudioSetupTab = ({ group, colors, isDark, styles }: StudioSetupTabProps) => {
  const amenities = group.amenities || [];
  const studioEquipment = group.instruments || [];
  const legacyEquipment: string[] = [];

  if (amenities.length > 0 && studioEquipment.length === 0) {
    amenities.forEach((item: string) => {
      const lower = item.toLowerCase();
      if (
        lower.includes("mic") ||
        lower.includes("drum") ||
        lower.includes("guitar") ||
        lower.includes("bass") ||
        lower.includes("keyboard") ||
        lower.includes("amp") ||
        lower.includes("console") ||
        lower.includes("interface")
      ) {
        legacyEquipment.push(item);
      }
    });
  }

  const title = group.type === "Venue" ? "Venue Specs" : "Studio Amenities";
  const getAmenityIcon = (tag: string) => {
    const lower = tag.toLowerCase();

    if (lower.includes("wifi") || lower.includes("wi-fi")) return "wifi";
    if (lower.includes("parking")) return "car-outline";
    if (lower.includes("air") || lower.includes("ac")) return "snow-outline";
    if (lower.includes("restroom") || lower.includes("toilet")) return "male-female-outline";
    if (lower.includes("coffee") || lower.includes("drink")) return "cafe-outline";
    if (lower.includes("stage")) return "easel-outline";

    return "checkmark-circle";
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.tagsContainer}>
          {amenities.length > 0 ? (
            amenities.map((tag: string, index: number) => (
              <View
                key={`${tag}-${index}`}
                style={[
                  styles.amenityChip || styles.tag,
                  {
                    borderColor: colors.primary,
                    backgroundColor: isDark
                      ? "rgba(99, 102, 241, 0.14)"
                      : "rgba(99, 102, 241, 0.08)",
                  },
                ]}
              >
                <Ionicons
                  name={getAmenityIcon(tag) as any}
                  size={16}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    lineHeight: 18,
                    fontFamily: "Poppins_600SemiBold",
                    flexShrink: 1,
                    includeFontPadding: false,
                    textAlignVertical: "center",
                  }}
                  numberOfLines={1}
                >
                  {tag}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>
              No specs listed for this {group.type === "Venue" ? "venue" : "studio"}.
            </Text>
          )}
        </View>
      </View>

      {studioEquipment.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Studio Equipment</Text>
          <View style={{ gap: 16 }}>
            {studioEquipment.map(
              (
                item: {
                  name: string;
                  quantity?: number;
                  description?: string;
                  image?: string;
                },
                i: number,
              ) => (
                <View
                  key={i}
                  style={[
                    styles.equipmentCard,
                    {
                      backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {item.image ? (
                      <CachedImage
                        uri={item.image}
                        style={styles.equipmentImage}
                        width={120}
                        height={120}
                        quality={70}
                        cacheVersion={group.updated_at || group.created_at || group.id}
                      />
                    ) : (
                      <View
                        style={[
                          styles.equipmentIcon,
                          {
                            backgroundColor: isDark
                              ? "rgba(124, 58, 237, 0.15)"
                              : "rgba(124, 58, 237, 0.1)",
                          },
                        ]}
                      >
                        <Ionicons name="musical-notes" size={18} color={colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontFamily: "Poppins_600SemiBold",
                          fontSize: 14,
                        }}
                      >
                        {item.name}
                      </Text>
                      {item.quantity && item.quantity > 1 && (
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontFamily: "Poppins_400Regular",
                            fontSize: 12,
                          }}
                        >
                          Quantity: {item.quantity}
                        </Text>
                      )}
                    </View>
                  </View>
                  {item.description && (
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontFamily: "Poppins_400Regular",
                        fontSize: 13,
                        marginTop: 8,
                      }}
                    >
                      {item.description}
                    </Text>
                  )}
                </View>
              ),
            )}
          </View>
        </View>
      )}

      {legacyEquipment.length > 0 && studioEquipment.length === 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Available Equipment</Text>
          <View style={{ gap: 12 }}>
            {legacyEquipment.map((item: string, i: number) => (
              <View key={i} style={styles.checkRow}>
                <View
                  style={[
                    styles.equipmentIcon,
                    {
                      backgroundColor: isDark
                        ? "rgba(124, 58, 237, 0.15)"
                        : "rgba(124, 58, 237, 0.1)",
                    },
                  ]}
                >
                  <Ionicons name="musical-notes" size={18} color={colors.primary} />
                </View>
                <Text
                  style={{
                    color: colors.text,
                    marginLeft: 12,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

    </View>
  );
};

export default StudioSetupTab;
