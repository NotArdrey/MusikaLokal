import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

export interface FilterDropdownOption {
  label: string;
  value: string;
  disabled?: boolean;
  testID?: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterDropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyValue?: string;
  emptyLabel?: string;
  testID?: string;
}

export default function FilterDropdown({
  label,
  options,
  value,
  onChange,
  multiple = false,
  searchable = false,
  searchPlaceholder,
  emptyValue = 'all',
  emptyLabel = 'All',
  testID,
}: FilterDropdownProps) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);
  const selectedValues = useMemo(
    () => multiple ? (Array.isArray(value) ? value : []) : [Array.isArray(value) ? emptyValue : value],
    [emptyValue, multiple, value],
  );
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const selectedLabel = useMemo(() => {
    if (multiple) {
      if (selectedValues.length === 0) return emptyLabel;
      if (selectedValues.length > 1) return `${selectedValues.length} selected`;
    }

    const selectedOption = options.find((option) => option.value === selectedValues[0]);
    return selectedOption?.label || emptyLabel;
  }, [emptyLabel, multiple, options, selectedValues]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open, searchable]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const toggleOption = (optionValue: string) => {
    if (!multiple) {
      onChange(optionValue);
      close();
      return;
    }

    const nextValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
      : [...selectedValues, optionValue];
    onChange(nextValues);
  };

  const clearSelection = () => onChange(multiple ? [] : emptyValue);
  const hasSelection = multiple ? selectedValues.length > 0 : selectedValues[0] !== emptyValue;
  const controlId = `filter-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <>
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel}`}
        accessibilityState={{ expanded: open }}
        aria-controls={controlId}
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            backgroundColor: isDark ? colors.surface : '#FFFFFF',
            borderColor: hasSelection ? colors.primary : colors.border,
          },
        ]}
      >
        <Text numberOfLines={1} style={[styles.triggerText, { color: colors.text }]}>
          <Text style={{ color: colors.textSecondary }}>{label}: </Text>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${label} filter`}
          onPress={close}
          style={styles.backdrop}
        >
          <Pressable
            accessibilityLabel={`${label} filter options`}
            id={controlId}
            onPress={(event) => event.stopPropagation()}
            style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>{label}</Text>
              <TouchableOpacity accessibilityLabel={`Close ${label} filter`} onPress={close} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {searchable ? (
              <View style={[styles.searchBox, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                <Ionicons name="search-outline" size={17} color={colors.textSecondary} />
                <TextInput
                  ref={searchRef}
                  accessibilityLabel={`Search ${label.toLowerCase()}`}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`}
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {query ? (
                  <TouchableOpacity accessibilityLabel="Clear search" onPress={() => setQuery('')}>
                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <ScrollView style={styles.optionList} contentContainerStyle={styles.optionListContent} keyboardShouldPersistTaps="handled">
              {filteredOptions.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No {label.toLowerCase()} found</Text>
              ) : filteredOptions.map((option) => {
                const selected = selectedValues.includes(option.value);
                return (
                  <TouchableOpacity
                    key={option.value}
                    testID={option.testID}
                    accessibilityRole={multiple ? 'checkbox' : 'radio'}
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: selected, disabled: option.disabled }}
                    activeOpacity={0.75}
                    disabled={option.disabled}
                    onPress={() => toggleOption(option.value)}
                    style={[
                      styles.option,
                      selected && { backgroundColor: colors.primaryLight },
                      option.disabled && styles.disabled,
                    ]}
                  >
                    <View style={[
                      styles.selectionMark,
                      { borderColor: selected ? colors.primary : colors.border },
                      selected && { backgroundColor: colors.primary },
                      !multiple && styles.radioMark,
                    ]}>
                      {selected ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!hasSelection}
                onPress={clearSelection}
                style={[styles.footerButton, !hasSelection && styles.disabled]}
              >
                <Text style={[styles.clearText, { color: colors.primary }]}>Clear selection</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={close} style={[styles.doneButton, { backgroundColor: colors.primary }]}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  clearText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  closeButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  doneButton: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  emptyText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    paddingVertical: 28,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  footerButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingRight: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  option: {
    minHeight: 44,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionList: {
    maxHeight: 340,
    flexShrink: 1,
  },
  optionListContent: {
    gap: 2,
    paddingVertical: 8,
  },
  optionText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  radioMark: {
    borderRadius: 9,
  },
  searchBox: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
  },
  selectionMark: {
    width: 19,
    height: 19,
    borderWidth: 1.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  trigger: {
    minHeight: 44,
    maxWidth: 260,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  triggerText: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
});
