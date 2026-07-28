import React, { useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type CooldownUnit = "hours" | "days";

type Props = {
  hours: number;
  onChangeHours: (hours: number) => void;
  colors: any;
  isDark: boolean;
};

const MAX_COOLDOWN_HOURS = 365 * 24;
const PRESETS = [
  { label: "None", hours: 0 },
  { label: "12 hours", hours: 12 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
];

const formatAmount = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

export const formatGigReapplicationCooldown = (hours: number) => {
  const normalizedHours = Math.max(0, Math.round(Number(hours) || 0));
  if (normalizedHours === 0) return "No cooldown";
  if (normalizedHours < 24) {
    return `${normalizedHours} hour${normalizedHours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(normalizedHours / 24);
  const remainingHours = normalizedHours % 24;
  return remainingHours === 0
    ? `${days} day${days === 1 ? "" : "s"}`
    : `${days}d ${remainingHours}h`;
};

export default function GigReapplicationCooldownField({
  hours,
  onChangeHours,
  colors,
  isDark,
}: Props) {
  const [unit, setUnit] = useState<CooldownUnit>(
    hours > 0 && hours < 24 ? "hours" : "days",
  );
  const displayValue = unit === "days" ? hours / 24 : hours;

  const updateAmount = (rawValue: string) => {
    const cleaned = rawValue.replace(/[^0-9.]/g, "");
    const amount = Number(cleaned);
    if (!Number.isFinite(amount)) {
      onChangeHours(0);
      return;
    }

    const nextHours = unit === "days" ? amount * 24 : amount;
    onChangeHours(Math.min(MAX_COOLDOWN_HOURS, Math.max(0, Math.round(nextHours))));
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TextInput
          accessibilityLabel="Reapplication cooldown amount"
          keyboardType="decimal-pad"
          value={formatAmount(displayValue)}
          onChangeText={updateAmount}
          style={{
            flex: 1,
            minHeight: 46,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 14,
            color: colors.text,
            backgroundColor: colors.inputBackground,
            fontFamily: "Poppins_500Medium",
          }}
        />
        {(["hours", "days"] as CooldownUnit[]).map((option) => {
          const selected = unit === option;
          return (
            <TouchableOpacity
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setUnit(option)}
              style={{
                minHeight: 46,
                justifyContent: "center",
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected
                  ? colors.primary
                  : isDark
                    ? "#374151"
                    : "#F3F4F6",
              }}
            >
              <Text
                style={{
                  color: selected ? "#FFFFFF" : colors.text,
                  fontFamily: "Poppins_500Medium",
                  fontSize: 12,
                  textTransform: "capitalize",
                }}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 11 }}>
        {hours === 0
          ? "Musicians can reapply immediately after rejection."
          : `Musicians can reapply exactly ${formatGigReapplicationCooldown(hours)} after rejection.`}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PRESETS.map((preset) => {
          const selected = hours === preset.hours;
          return (
            <TouchableOpacity
              key={preset.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                onChangeHours(preset.hours);
                setUnit(preset.hours > 0 && preset.hours < 24 ? "hours" : "days");
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: selected
                  ? colors.primary
                  : isDark
                    ? "#374151"
                    : "#E5E7EB",
              }}
            >
              <Text
                style={{
                  color: selected ? "#FFFFFF" : colors.text,
                  fontFamily: "Poppins_500Medium",
                  fontSize: 11,
                }}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
