import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatFriendlyDateTime } from '../utils/friendlyDateTime';

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
  newAvailableSlot?: {
    date: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface ConflictResolutionModalProps {
  visible: boolean;
  conflicts: ConflictingBooking[];
  onClose: () => void;
  onResolve: (actions: ConflictResolution[]) => Promise<void>;
  studioName: string;
}

export type ResolutionAction = 'move' | 'cancel' | 'skip';

export interface ConflictResolution {
  bookingId: string;
  action: ResolutionAction;
  newSlot?: {
    date: string;
    start_time: string;
    end_time: string;
  };
}

// useNativeDriver is not supported on web
const useNativeDriver = Platform.OS !== 'web';

export default function ConflictResolutionModal({
  visible,
  conflicts,
  onClose,
  onResolve,
  studioName,
}: ConflictResolutionModalProps) {
  const { colors, isDark } = useTheme();
  const [resolutions, setResolutions] = useState<{ [bookingId: string]: ResolutionAction }>({});
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

  const handleResolveAll = async () => {
    // Check if all conflicts have been addressed
    const unresolvedConflicts = conflicts.filter(
      (c) => !resolutions[c.id]
    );

    if (unresolvedConflicts.length > 0) {
      // Show message that all conflicts must be resolved
      return;
    }

    setIsResolving(true);
    try {
      const resolutionActions: ConflictResolution[] = conflicts.map((conflict) => ({
        bookingId: conflict.id,
        action: resolutions[conflict.id],
        newSlot: resolutions[conflict.id] === 'move' ? conflict.newAvailableSlot || undefined : undefined,
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
    conflicts.forEach((conflict) => {
      // Only allow move if there's an available slot
      newResolutions[conflict.id] = conflict.newAvailableSlot ? 'move' : 'cancel';
    });
    setResolutions(newResolutions);
  };

  const handleCancelAll = () => {
    const newResolutions: { [key: string]: ResolutionAction } = {};
    conflicts.forEach((conflict) => {
      newResolutions[conflict.id] = 'cancel';
    });
    setResolutions(newResolutions);
  };

  const allResolved = conflicts.every((c) => resolutions[c.id]);
  const moveableCount = conflicts.filter((c) => c.newAvailableSlot).length;

  return (
    <Modal
      visible={visible}
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
              {conflicts.length} booking{conflicts.length > 1 ? 's' : ''} conflict with your schedule changes for {studioName}
            </Text>
          </View>

          {/* Quick Actions */}
          <View style={[styles.quickActions, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }]}>
            <Text style={[styles.quickActionsLabel, { color: colors.textSecondary }]}>
              Quick Actions:
            </Text>
            <View style={styles.quickActionsButtons}>
              {moveableCount > 0 && (
                <TouchableOpacity activeOpacity={1}
                  style={[styles.quickActionBtn, { backgroundColor: colors.primary + '20' }]}
                  onPress={handleMoveAll}
                >
                  <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                  <Text style={[styles.quickActionText, { color: colors.primary }]}>
                    Move All ({moveableCount})
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity activeOpacity={1}
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
          <ScrollView style={styles.conflictList} showsVerticalScrollIndicator={false}>
            {conflicts.map((conflict, index) => (
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
                  {conflict.newAvailableSlot && (
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
                      onPress={() => setResolutionAction(conflict.id, 'move')}
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
                          Move to Next Available
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
                          {formatDate(conflict.newAvailableSlot.date)} at{' '}
                          {formatTime(conflict.newAvailableSlot.start_time)} -{' '}
                          {formatTime(conflict.newAvailableSlot.end_time)}
                        </Text>
                      </View>
                      {resolutions[conflict.id] === 'move' && (
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
            ))}
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
                    Resolve & Save
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
