import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type ThemeModeToggleProps = {
  compact?: boolean;
  showLabel?: boolean;
  variant?: 'segmented' | 'button';
};

const modes = [
  { id: 'light', label: 'Light', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
] as const;

export default function ThemeModeToggle({
  compact = false,
  showLabel = true,
  variant = 'segmented',
}: ThemeModeToggleProps) {
  const { colors, isDark, setTheme } = useTheme();
  const activeMode = isDark ? 'dark' : 'light';

  if (variant === 'button') {
    const nextMode = isDark ? 'light' : 'dark';
    const label = isDark ? 'Light' : 'Dark';

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${label.toLowerCase()} mode`}
        onPress={() => setTheme(nextMode)}
        style={[
          styles.iconButton,
          compact && styles.iconButtonCompact,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons
          name={isDark ? 'sunny-outline' : 'moon-outline'}
          size={compact ? 18 : 19}
          color={colors.textSecondary}
        />
        {showLabel ? (
          <Text style={[styles.buttonText, { color: colors.textSecondary }]}>{label}</Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.segmented,
        compact && styles.segmentedCompact,
        {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.78)' : '#F1F5F9',
          borderColor: colors.border,
        },
      ]}
    >
      {modes.map((mode) => {
        const isActive = activeMode === mode.id;

        return (
          <TouchableOpacity
            key={mode.id}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityLabel={`Use ${mode.label.toLowerCase()} mode`}
            accessibilityState={{ selected: isActive }}
            onPress={() => setTheme(mode.id)}
            style={[
              styles.segmentButton,
              compact && styles.segmentButtonCompact,
              {
                backgroundColor: isActive ? colors.primary : 'transparent',
              },
            ]}
          >
            <Ionicons
              name={mode.icon as any}
              size={16}
              color={isActive ? '#FFFFFF' : colors.textSecondary}
            />
            {showLabel && !compact ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.segmentText,
                  { color: isActive ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                {mode.label}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    width: '100%',
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segmentedCompact: {
    width: 'auto',
    alignSelf: 'flex-start',
  },
  segmentButton: {
    flex: 1,
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentButtonCompact: {
    flex: 0,
    width: 36,
    paddingHorizontal: 0,
  },
  segmentText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  iconButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  iconButtonCompact: {
    width: 40,
    height: 40,
    minHeight: 40,
    paddingHorizontal: 0,
  },
  buttonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
});
