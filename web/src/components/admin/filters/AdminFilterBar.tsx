import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import useAdminLayout from '../../../hooks/useAdminLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActiveFilterChips, { ActiveFilterChip } from './ActiveFilterChips';
import FilterDropdown from './FilterDropdown';
import SegmentedFilter from './SegmentedFilter';

export type AdminFilterType = 'segmented' | 'single-select' | 'multi-select' | 'date-range';
export type AdminFilterValue = string | string[];

export interface AdminFilterOption {
  label: string;
  value: string;
  disabled?: boolean;
  testID?: string;
}

export interface AdminFilterDefinition {
  key: string;
  label: string;
  type: AdminFilterType;
  options: AdminFilterOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyValue?: string;
  emptyLabel?: string;
  defaultValue?: AdminFilterValue;
  advanced?: boolean;
  showActiveChips?: boolean;
  testID?: string;
}

interface AdminFilterBarProps {
  filters: AdminFilterDefinition[];
  values: Record<string, AdminFilterValue>;
  onChange: (key: string, value: AdminFilterValue) => void;
  sortElement?: ReactNode;
}

const isEmptyValue = (definition: AdminFilterDefinition, value: AdminFilterValue | undefined) => {
  const defaultValue = definition.defaultValue ?? (definition.type === 'multi-select' ? [] : (definition.emptyValue || 'all'));
  if (Array.isArray(defaultValue)) {
    return Array.isArray(value) && value.length === defaultValue.length && value.every((item) => defaultValue.includes(item));
  }
  return value === defaultValue;
};

export default function AdminFilterBar({ filters, values, onChange, sortElement }: AdminFilterBarProps) {
  const { colors } = useTheme();
  const { isCompact: isMobile } = useAdminLayout();
  const insets = useSafeAreaInsets();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const primaryFilters = filters.filter((filter) => !filter.advanced);
  const advancedFilters = filters.filter((filter) => filter.advanced);

  const activeCount = useMemo(
    () => filters.reduce((count, definition) => count + (isEmptyValue(definition, values[definition.key]) ? 0 : 1), 0),
    [filters, values],
  );

  const activeChips = useMemo(() => filters.flatMap((definition): ActiveFilterChip[] => {
    if (definition.showActiveChips === false || definition.type === 'segmented') return [];
    const currentValue = values[definition.key];
    if (isEmptyValue(definition, currentValue)) return [];
    const selectedValues = Array.isArray(currentValue) ? currentValue : [currentValue];

    return selectedValues.map((selectedValue) => ({
      key: `${definition.key}:${selectedValue}`,
      label: definition.options.find((option) => option.value === selectedValue)?.label || selectedValue,
      accessibilityLabel: `Remove ${definition.label} filter ${selectedValue}`,
    }));
  }), [filters, values]);

  const resetFilter = (definition: AdminFilterDefinition) => {
    onChange(
      definition.key,
      definition.defaultValue ?? (definition.type === 'multi-select' ? [] : (definition.emptyValue || 'all')),
    );
  };

  const removeChip = (chipKey: string) => {
    const separatorIndex = chipKey.indexOf(':');
    const filterKey = chipKey.slice(0, separatorIndex);
    const optionValue = chipKey.slice(separatorIndex + 1);
    const definition = filters.find((filter) => filter.key === filterKey);
    if (!definition) return;

    const currentValue = values[filterKey];
    if (Array.isArray(currentValue)) {
      onChange(filterKey, currentValue.filter((value) => value !== optionValue));
    } else {
      resetFilter(definition);
    }
  };

  const clearAll = () => filters.forEach(resetFilter);

  const renderFilter = (definition: AdminFilterDefinition) => {
    const currentValue = values[definition.key] ?? definition.defaultValue ?? (
      definition.type === 'multi-select' ? [] : (definition.emptyValue || 'all')
    );

    if (definition.type === 'segmented') {
      return (
        <SegmentedFilter
          key={definition.key}
          label={definition.label}
          options={definition.options}
          value={Array.isArray(currentValue) ? '' : currentValue}
          onChange={(nextValue) => onChange(definition.key, nextValue)}
        />
      );
    }

    return (
      <FilterDropdown
        key={definition.key}
        label={definition.label}
        multiple={definition.type === 'multi-select'}
        searchable={definition.searchable}
        searchPlaceholder={definition.searchPlaceholder}
        options={definition.options}
        value={currentValue}
        testID={definition.testID}
        onChange={(nextValue) => onChange(definition.key, nextValue)}
        emptyValue={definition.emptyValue}
        emptyLabel={definition.emptyLabel}
      />
    );
  };

  const filtersContent = (definitions: AdminFilterDefinition[]) => (
    <View style={styles.filterGroups}>{definitions.map(renderFilter)}</View>
  );

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {isMobile ? (
        <View style={styles.mobileToolbar}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded: mobileOpen }}
            onPress={() => setMobileOpen(true)}
            style={[styles.mobileFilterButton, { borderColor: colors.border }]}
          >
            <Ionicons name="options-outline" size={17} color={colors.text} />
            <Text style={[styles.mobileFilterText, { color: colors.text }]}>Filters{activeCount ? ` (${activeCount})` : ''}</Text>
          </TouchableOpacity>
          {sortElement}
        </View>
      ) : (
        <>
          <View style={styles.desktopToolbar}>
            <View style={styles.primaryFilters}>{filtersContent(primaryFilters)}</View>
            {sortElement ? <View style={styles.sort}>{sortElement}</View> : null}
          </View>
          {advancedFilters.length ? (
            <TouchableOpacity onPress={() => setAdvancedOpen((current) => !current)} style={styles.moreButton}>
              <Ionicons name="options-outline" size={16} color={colors.primary} />
              <Text style={[styles.moreText, { color: colors.primary }]}>More filters</Text>
            </TouchableOpacity>
          ) : null}
          {advancedOpen ? filtersContent(advancedFilters) : null}
        </>
      )}

      <ActiveFilterChips chips={activeChips} onRemove={removeChip} onClearAll={clearAll} />

      <Modal visible={mobileOpen} transparent animationType="slide" onRequestClose={() => setMobileOpen(false)}>
        <Pressable style={styles.mobileBackdrop} onPress={() => setMobileOpen(false)}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.mobileSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(18, insets.bottom) }]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filters</Text>
              <TouchableOpacity accessibilityLabel="Close filters" onPress={() => setMobileOpen(false)} style={styles.sheetClose}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              {filtersContent(filters)}
            </ScrollView>
            <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity disabled={!activeCount} onPress={clearAll} style={[styles.sheetClear, !activeCount && styles.disabled]}>
                <Text style={[styles.sheetClearText, { color: colors.primary }]}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMobileOpen(false)} style={[styles.sheetDone, { backgroundColor: colors.primary }]}>
                <Text style={styles.sheetDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  desktopToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  disabled: {
    opacity: 0.45,
  },
  filterGroups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 14,
  },
  mobileBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  mobileFilterButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
  },
  mobileFilterText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  mobileSheet: {
    maxHeight: '88%',
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
  },
  mobileToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  moreButton: {
    minHeight: 36,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moreText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  primaryFilters: {
    flex: 1,
    minWidth: 0,
  },
  sheetClear: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sheetClearText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  sheetClose: {
    minHeight: 42,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    paddingVertical: 14,
  },
  sheetDone: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  sheetDoneText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  sheetFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
  },
  sort: {
    marginLeft: 'auto',
  },
});
