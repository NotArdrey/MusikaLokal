import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatFriendlyDateTime } from '../utils/friendlyDateTime';

export interface RelocationSlot {
  date: string;
  start_time: string;
  end_time: string;
}

export interface ConflictingBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  conflictType: 'time_overlap' | 'date_removed' | 'date_override';
  newAvailableSlot?: RelocationSlot | null;
  availableRelocationSlots?: RelocationSlot[];
}

interface ConflictResolutionModalProps {
  visible: boolean;
  conflicts: ConflictingBooking[];
  onClose: () => void;
  onResolve: (actions: ConflictResolution[]) => Promise<void>;
  studioName: string;
  subtitle?: string;
  resolveLabel?: string;
  allowMusicianChoose?: boolean;
  allowMove?: boolean;
}

export type ResolutionAction = 'move' | 'cancel' | 'choose' | 'skip';

export interface ConflictResolution {
  bookingId: string;
  action: ResolutionAction;
  newSlot?: RelocationSlot;
}

export default function ConflictResolutionModal({
  visible,
  conflicts,
  onClose,
  onResolve,
  studioName,
  subtitle,
  resolveLabel = 'Resolve & Save',
  allowMusicianChoose = true,
  allowMove = true,
}: ConflictResolutionModalProps) {
  const { colors, isDark } = useTheme();
  const [resolutions, setResolutions] = useState<{ [bookingId: string]: ResolutionAction }>({});
  const [selectedSlots, setSelectedSlots] = useState<{ [bookingId: string]: RelocationSlot }>({});
  const [isResolving, setIsResolving] = useState(false);

  const formatDate = (dateStr: string) => {
    return formatFriendlyDateTime(dateStr, {
      forceDateOnly: true,
      fallback: dateStr,
    });
  };

  const formatTime = (timeStr: string) => {
    // Handle HH:MM:SS or HH:MM format
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:${minutes} ${period}`;
  };

  const setResolutionAction = (bookingId: string, action: ResolutionAction) => {
    setResolutions((prev) => ({
      ...prev,
      [bookingId]: action,
    }));
  };

  const slotKey = (slot: RelocationSlot) =>
    `${slot.date}|${slot.start_time.substring(0, 5)}|${slot.end_time.substring(0, 5)}`;

  const toMinutes = (time: string) => {
    const [hours, minutes] = time.substring(0, 5).split(':').map(Number);
    return hours * 60 + minutes;
  };

  const slotsOverlap = (first: RelocationSlot, second: RelocationSlot) => {
    if (first.date !== second.date) return false;
    return !(
      toMinutes(first.end_time) <= toMinutes(second.start_time) ||
      toMinutes(first.start_time) >= toMinutes(second.end_time)
    );
  };

  const getCandidateSlots = (conflict: ConflictingBooking): RelocationSlot[] => {
    const rawSlots =
      conflict.availableRelocationSlots && conflict.availableRelocationSlots.length > 0
        ? conflict.availableRelocationSlots
        : conflict.newAvailableSlot
          ? [conflict.newAvailableSlot]
          : [];
    const seen = new Set<string>();
    return rawSlots.filter((slot) => {
      const key = slotKey(slot);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getSelectedSlot = (conflict: ConflictingBooking): RelocationSlot | null =>
    selectedSlots[conflict.id] || conflict.newAvailableSlot || getCandidateSlots(conflict)[0] || null;

  const isSlotUsedByAnotherMove = (bookingId: string, slot: RelocationSlot) =>
    conflicts.some((conflict) => {
      if (conflict.id === bookingId || resolutions[conflict.id] !== 'move') return false;
      const selected = getSelectedSlot(conflict);
      return selected ? slotsOverlap(selected, slot) : false;
    });

  const selectMoveSlot = (bookingId: string, slot: RelocationSlot) => {
    setSelectedSlots((prev) => ({
      ...prev,
      [bookingId]: slot,
    }));
    setResolutionAction(bookingId, 'move');
  };

  const handleResolveAll = async () => {
    // Check if all conflicts have been addressed
    const unresolvedConflicts = conflicts.filter((c) => {
      if (!resolutions[c.id]) return true;
      return resolutions[c.id] === 'move' && !getSelectedSlot(c);
    });

    if (unresolvedConflicts.length > 0) {
      // Show message that all conflicts must be resolved
      return;
    }

    setIsResolving(true);
    try {
      const resolutionActions: ConflictResolution[] = conflicts.map((conflict) => ({
        bookingId: conflict.id,
        action: resolutions[conflict.id],
        newSlot: resolutions[conflict.id] === 'move' ? getSelectedSlot(conflict) || undefined : undefined,
      }));

      await onResolve(resolutionActions);
    } catch (error) {
      console.error('Error resolving conflicts:', error);
    } finally {
      setIsResolving(false);
    }
  };

  const handleMoveAll = () => {
    const newResolutions: { [key: string]: ResolutionAction } = {};
    const newSelectedSlots: { [key: string]: RelocationSlot } = {};
    conflicts.forEach((conflict) => {
      const slot = getCandidateSlots(conflict).find(
        (candidate) =>
          !Object.values(newSelectedSlots).some((selected) =>
            slotsOverlap(selected, candidate),
          ),
      );
      if (slot) {
        newResolutions[conflict.id] = 'move';
        newSelectedSlots[conflict.id] = slot;
      } else {
        newResolutions[conflict.id] = 'cancel';
      }
    });
    setResolutions(newResolutions);
    setSelectedSlots(newSelectedSlots);
  };

  const handleCancelAll = () => {
    const newResolutions: { [key: string]: ResolutionAction } = {};
    conflicts.forEach((conflict) => {
      newResolutions[conflict.id] = 'cancel';
    });
    setResolutions(newResolutions);
    setSelectedSlots({});
  };

  const handleChooseAll = () => {
    const newResolutions: { [key: string]: ResolutionAction } = {};
    conflicts.forEach((conflict) => {
      newResolutions[conflict.id] =
        getCandidateSlots(conflict).length > 0 ? 'choose' : 'cancel';
    });
    setResolutions(newResolutions);
    setSelectedSlots({});
  };

  const selectedMoveSlots = conflicts
    .filter((c) => resolutions[c.id] === 'move')
    .map((c) => ({ id: c.id, slot: getSelectedSlot(c) }));
  const hasSelectedMoveOverlap = selectedMoveSlots.some((entry, index) =>
    selectedMoveSlots.some(
      (other, otherIndex) =>
        otherIndex > index &&
        Boolean(entry.slot) &&
        Boolean(other.slot) &&
        slotsOverlap(entry.slot as RelocationSlot, other.slot as RelocationSlot),
    ),
  );
  const allResolved =
    !hasSelectedMoveOverlap &&
    conflicts.every(
      (c) => resolutions[c.id] && (resolutions[c.id] !== 'move' || getSelectedSlot(c)),
    );
  const moveableCount = conflicts.filter((c) => getCandidateSlots(c).length > 0).length;
  const musicianChooseCount = allowMusicianChoose ? moveableCount : 0;

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="slide"
      transparent={true}
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.card,
              maxHeight: '85%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerIcon}>
              <Ionicons name="warning" size={28} color="#F59E0B" />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
              Booking Conflicts Detected
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {subtitle ||
                `${conflicts.length} booking${conflicts.length > 1 ? 's' : ''} conflict with your schedule changes for ${studioName}`}
            </Text>
          </View>

          {/* Quick Actions */}
          <View style={[styles.quickActions, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }]}>
            <Text style={[styles.quickActionsLabel, { color: colors.textSecondary }]}>
              Quick Actions:
            </Text>
            <View style={styles.quickActionsButtons}>
              {allowMove && moveableCount > 0 && (
                <TouchableOpacity activeOpacity={0.78}
                  style={[styles.quickActionBtn, { backgroundColor: colors.primary + '20' }]}
                  onPress={handleMoveAll}
                >
                  <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                  <Text style={[styles.quickActionText, { color: colors.primary }]}>
                    Move All ({moveableCount})
                  </Text>
                </TouchableOpacity>
              )}
              {musicianChooseCount > 0 && (
                <TouchableOpacity activeOpacity={0.78}
                  style={[styles.quickActionBtn, { backgroundColor: 'rgba(14, 165, 233, 0.12)' }]}
                  onPress={handleChooseAll}
                >
                  <Ionicons name="person-circle" size={16} color="#0EA5E9" />
                  <Text style={[styles.quickActionText, { color: '#0EA5E9' }]}>
                    Ask All ({musicianChooseCount})
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity activeOpacity={0.78}
                style={[styles.quickActionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
                onPress={handleCancelAll}
              >
                <Ionicons name="close-circle" size={16} color="#EF4444" />
                <Text style={[styles.quickActionText, { color: '#EF4444' }]}>
                  Cancel All
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Conflict List */}
          <ScrollView
            style={styles.conflictList}
            contentContainerStyle={styles.conflictListContent}
            showsVerticalScrollIndicator={false}
          >
            {conflicts.map((conflict) => {
              const candidateSlots = getCandidateSlots(conflict);
              const selectedSlot = getSelectedSlot(conflict);
              const canLetMusicianChoose = allowMusicianChoose && candidateSlots.length > 0;
              return (
              <View
                key={conflict.id}
                style={[
                  styles.conflictCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    borderColor: resolutions[conflict.id] ? colors.primary : colors.border,
                    borderWidth: resolutions[conflict.id] ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.conflictHeader}>
                  <View style={styles.conflictInfo}>
                    <Text style={[styles.conflictDate, { color: colors.text }]}>
                      {formatDate(conflict.booking_date)}
                    </Text>
                    <Text style={[styles.conflictTime, { color: colors.textSecondary }]}>
                      {formatTime(conflict.start_time)} - {formatTime(conflict.end_time)}
                    </Text>
                    {conflict.user_name && (
                      <Text style={[styles.conflictUser, { color: colors.textSecondary }]}>
                        Booked by: {conflict.user_name}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          conflict.status === 'confirmed'
                            ? 'rgba(16, 185, 129, 0.1)'
                            : 'rgba(245, 158, 11, 0.1)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            conflict.status === 'confirmed' ? '#10B981' : '#F59E0B',
                        },
                      ]}
                    >
                      {conflict.status}
                    </Text>
                  </View>
                </View>

                {/* Action Options */}
                <View style={styles.actionOptions}>
                  {allowMove && selectedSlot && (
                    <TouchableOpacity activeOpacity={1}
                      style={[
                        styles.actionOption,
                        {
                          backgroundColor:
                            resolutions[conflict.id] === 'move'
                              ? colors.primary
                              : isDark
                              ? 'rgba(255,255,255,0.1)'
                              : 'rgba(0,0,0,0.05)',
                          borderColor:
                            resolutions[conflict.id] === 'move'
                              ? colors.primary
                              : colors.border,
                        },
                      ]}
                      onPress={() => selectMoveSlot(conflict.id, selectedSlot)}
                    >
                      <Ionicons
                        name="swap-horizontal"
                        size={18}
                        color={resolutions[conflict.id] === 'move' ? '#fff' : colors.primary}
                      />
                      <View style={styles.actionOptionContent}>
                        <Text
                          style={[
                            styles.actionOptionTitle,
                            {
                              color:
                                resolutions[conflict.id] === 'move' ? '#fff' : colors.text,
                            },
                          ]}
                        >
                          Move Booking
                        </Text>
                        <Text
                          style={[
                            styles.actionOptionSubtitle,
                            {
                              color:
                                resolutions[conflict.id] === 'move'
                                  ? 'rgba(255,255,255,0.8)'
                                  : colors.textSecondary,
                            },
                          ]}
                        >
                          {formatDate(selectedSlot.date)} at{' '}
                          {formatTime(selectedSlot.start_time)} -{' '}
                          {formatTime(selectedSlot.end_time)}
                        </Text>
                      </View>
                      {resolutions[conflict.id] === 'move' && (
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      )}
                    </TouchableOpacity>
                  )}

                  {resolutions[conflict.id] === 'move' && candidateSlots.length > 1 && (
                    <View
                      style={[
                        styles.slotPicker,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.slotPickerHeader}>
                        <Ionicons name="calendar" size={15} color={colors.primary} />
                        <Text style={[styles.slotPickerTitle, { color: colors.text }]}>
                          Pick New Slot
                        </Text>
                      </View>
                      <View style={styles.slotOptions}>
                        {candidateSlots.map((slot) => {
                          const isSelected = selectedSlot ? slotKey(selectedSlot) === slotKey(slot) : false;
                          const isUsed = !isSelected && isSlotUsedByAnotherMove(conflict.id, slot);
                          return (
                            <TouchableOpacity
                              key={slotKey(slot)}
                              activeOpacity={isUsed ? 1 : 0.78}
                              disabled={isUsed}
                              style={[
                                styles.slotOption,
                                {
                                  backgroundColor: isSelected
                                    ? colors.primary
                                    : isDark
                                      ? 'rgba(255,255,255,0.08)'
                                      : 'rgba(0,0,0,0.04)',
                                  borderColor: isSelected ? colors.primary : colors.border,
                                  opacity: isUsed ? 0.42 : 1,
                                },
                              ]}
                              onPress={() => selectMoveSlot(conflict.id, slot)}
                            >
                              <Text
                                style={[
                                  styles.slotOptionDate,
                                  { color: isSelected ? '#fff' : colors.text },
                                ]}
                                numberOfLines={1}
                              >
                                {formatDate(slot.date)}
                              </Text>
                              <Text
                                style={[
                                  styles.slotOptionTime,
                                  {
                                    color: isSelected
                                      ? 'rgba(255,255,255,0.82)'
                                      : colors.textSecondary,
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {canLetMusicianChoose && (
                    <TouchableOpacity activeOpacity={1}
                      style={[
                        styles.actionOption,
                        {
                          backgroundColor:
                            resolutions[conflict.id] === 'choose'
                              ? '#0EA5E9'
                              : isDark
                              ? 'rgba(255,255,255,0.1)'
                              : 'rgba(0,0,0,0.05)',
                          borderColor:
                            resolutions[conflict.id] === 'choose' ? '#0EA5E9' : colors.border,
                        },
                      ]}
                      onPress={() => setResolutionAction(conflict.id, 'choose')}
                    >
                      <Ionicons
                        name="person-circle"
                        size={18}
                        color={resolutions[conflict.id] === 'choose' ? '#fff' : '#0EA5E9'}
                      />
                      <View style={styles.actionOptionContent}>
                        <Text
                          style={[
                            styles.actionOptionTitle,
                            {
                              color:
                                resolutions[conflict.id] === 'choose' ? '#fff' : colors.text,
                            },
                          ]}
                        >
                          Let Musician Choose
                        </Text>
                        <Text
                          style={[
                            styles.actionOptionSubtitle,
                            {
                              color:
                                resolutions[conflict.id] === 'choose'
                                  ? 'rgba(255,255,255,0.8)'
                                  : colors.textSecondary,
                            },
                          ]}
                        >
                          They can pick an available slot in Bookings
                        </Text>
                      </View>
                      {resolutions[conflict.id] === 'choose' && (
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity activeOpacity={1}
                    style={[
                      styles.actionOption,
                      {
                        backgroundColor:
                          resolutions[conflict.id] === 'cancel'
                            ? '#EF4444'
                            : isDark
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(0,0,0,0.05)',
                        borderColor:
                          resolutions[conflict.id] === 'cancel' ? '#EF4444' : colors.border,
                      },
                    ]}
                    onPress={() => setResolutionAction(conflict.id, 'cancel')}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={resolutions[conflict.id] === 'cancel' ? '#fff' : '#EF4444'}
                    />
                    <View style={styles.actionOptionContent}>
                      <Text
                        style={[
                          styles.actionOptionTitle,
                          {
                            color:
                              resolutions[conflict.id] === 'cancel' ? '#fff' : colors.text,
                          },
                        ]}
                      >
                        Cancel This Booking
                      </Text>
                      <Text
                        style={[
                          styles.actionOptionSubtitle,
                          {
                            color:
                              resolutions[conflict.id] === 'cancel'
                                ? 'rgba(255,255,255,0.8)'
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        Customer will be notified & refunded
                      </Text>
                    </View>
                    {resolutions[conflict.id] === 'cancel' && (
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              );
            })}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity activeOpacity={1}
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={isResolving}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                Go Back
              </Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={!allResolved || isResolving ? 1 : 0.78}
              style={[
                styles.resolveBtn,
                {
                  backgroundColor: allResolved ? colors.primary : colors.primary + '50',
                  opacity: !allResolved || isResolving ? 0.6 : 1,
                },
              ]}
              onPress={handleResolveAll}
              disabled={!allResolved || isResolving}
            >
              {isResolving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.resolveBtnText}>
                    {resolveLabel}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  quickActions: {
    padding: 12,
    paddingHorizontal: 16,
  },
  quickActionsLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 8,
  },
  quickActionsButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  quickActionText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
  },
  conflictList: {
    maxHeight: 350,
  },
  conflictListContent: {
    paddingHorizontal: 16,
  },
  conflictCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  conflictHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  conflictInfo: {
    flex: 1,
  },
  conflictDate: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 2,
  },
  conflictTime: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  conflictUser: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    textTransform: 'capitalize',
  },
  actionOptions: {
    gap: 8,
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  actionOptionContent: {
    flex: 1,
  },
  actionOptionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  actionOptionSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  slotPicker: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  slotPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotPickerTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  slotOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotOption: {
    minWidth: 132,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  slotOptionDate: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  slotOptionTime: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
  },
  resolveBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  resolveBtnText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: '#fff',
  },
});
