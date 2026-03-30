import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ListingBottomBarProps {
  styles: any;
  colors: any;
  displayRate: string;
  labels: { unit: string };
  onReserve: () => void;
  hasActivePromotion?: boolean;
}

const ListingBottomBar = ({
  styles,
  colors,
  displayRate,
  labels,
  onReserve,
  hasActivePromotion = false,
}: ListingBottomBarProps) => (
  <View
    style={[
      styles.bottomBar,
      {
        backgroundColor: colors.background,
        borderTopColor: colors.border,
      },
    ]}
  >
    <View style={styles.priceContainer}>
      <Text style={[styles.priceText, { color: colors.text }]}>
        {`₱${displayRate} `}
        <Text
          style={{
            fontSize: 14,
            fontWeight: "400",
            color: colors.textSecondary,
          }}
        >
          {labels.unit}
        </Text>
      </Text>
      {hasActivePromotion && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          <Ionicons name="pricetag" size={10} color={colors.primary} />
          <Text style={{ fontSize: 11, fontFamily: "Poppins_500Medium", color: colors.primary }}>
            Promo available
          </Text>
        </View>
      )}
    </View>
    <TouchableOpacity activeOpacity={1}
      style={[styles.bookBtn, { backgroundColor: colors.primary }]}
      onPress={onReserve}
    >
      <Text style={styles.bookBtnText}>Reserve</Text>
    </TouchableOpacity>
  </View>
);

export default ListingBottomBar;
