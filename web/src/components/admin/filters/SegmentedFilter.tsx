import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

export interface SegmentedFilterOption {
  label: string;
  value: string;
  disabled?: boolean;
  testID?: string;
}

interface SegmentedFilterProps {
  label: string;
  options: SegmentedFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export default function SegmentedFilter({ label, options, value, onChange }: SegmentedFilterProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <TouchableOpacity
              key={option.value}
              testID={option.testID}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityState={{ checked: selected, disabled: option.disabled }}
              activeOpacity={0.8}
              disabled={option.disabled}
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? colors.primary : (isDark ? colors.surface : '#FFFFFF'),
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: option.disabled ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.optionText, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  label: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  option: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
