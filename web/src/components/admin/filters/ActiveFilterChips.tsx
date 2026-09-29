import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

export interface ActiveFilterChip {
  key: string;
  label: string;
  accessibilityLabel: string;
}

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export default function ActiveFilterChips({ chips, onRemove, onClearAll }: ActiveFilterChipsProps) {
  const { colors } = useTheme();
  if (chips.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.caption, { color: colors.textSecondary }]}>Active filters:</Text>
      <View style={styles.chips}>
        {chips.map((chip) => (
          <TouchableOpacity
            key={chip.key}
            accessibilityRole="button"
            accessibilityLabel={chip.accessibilityLabel}
            activeOpacity={0.75}
            onPress={() => onRemove(chip.key)}
            style={[styles.chip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
          >
            <Text style={[styles.chipText, { color: colors.primaryDark }]}>{chip.label}</Text>
            <Ionicons name="close" size={15} color={colors.primaryDark} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity accessibilityRole="button" onPress={onClearAll} style={styles.clearButton}>
          <Text style={[styles.clearText, { color: colors.primary }]}>Clear all</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
  chip: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },
  clearButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  clearText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  container: {
    gap: 7,
  },
});
