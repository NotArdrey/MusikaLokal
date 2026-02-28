import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ListingBottomBarProps {
  styles: any;
  colors: any;
  displayRate: string;
  labels: { unit: string };
  onReserve: () => void;
}

const ListingBottomBar = ({
  styles,
  colors,
  displayRate,
  labels,
  onReserve,
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
