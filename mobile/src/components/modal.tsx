import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal as RNModal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { isE2EFixtureMode } from '../utils/e2eFixtures';
import { motion } from '../utils/motion';
import CustomAlert from './CustomAlert';
import InAppMediaViewer from './InAppMediaViewer';

type CustomModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  title?: string;
  message?: string;
  buttonText?: string;
  showInput?: boolean;
  danger?: boolean;
  onInputChange?: (text: string) => void;
  inputValue?: string;
  inputPlaceholder?: string;
  inputMultiline?: boolean;
  requiredInputValue?: string;
  confirmDisabled?: boolean;
  requireTermsAcceptance?: boolean;
  termsLabel?: string;
  onTermsPress?: () => void;
  termsLinkLabel?: string;
  contractUrl?: string | null;
  contractName?: string;
  summaryItems?: { label: string; value: string | number | null | undefined; icon?: keyof typeof Ionicons.glyphMap }[];
  loading?: boolean;
  loadingMessage?: string;
  showCancelButton?: boolean;
};

export const normalizeVisibleInput = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .trim();

export const normalizeConfirmationInput = (value: unknown) =>
  normalizeVisibleInput(value)
    .replace(/\s+/g, ' ')
    .toLowerCase();

const CustomModal: React.FC<CustomModalProps> = ({
  visible,
  onClose,
  onConfirm,
  title,
  message = '',
  buttonText = 'Close',
  showInput = false,
  danger = false,
  onInputChange,
  inputValue,
  inputPlaceholder = 'Enter reason...',
  inputMultiline = true,
  requiredInputValue,
  confirmDisabled = false,
  requireTermsAcceptance = false,
  termsLabel = 'I agree to the Terms and Conditions.',
  onTermsPress,
  termsLinkLabel = 'Read Terms and Conditions',
  contractUrl,
  contractName,
  summaryItems = [],
  loading = false,
  loadingMessage = 'Please wait...',
  showCancelButton = true
}) => {
  const { colors } = useTheme();
  const [isTermsAccepted, setIsTermsAccepted] = React.useState(false);
  const [isContractAccepted, setIsContractAccepted] = React.useState(false);
  const [showTermsContent, setShowTermsContent] = React.useState(false);
  const [feedbackVisible, setFeedbackVisible] = React.useState(false);
  const [feedbackMessage, setFeedbackMessage] = React.useState('');
  const [canInteract, setCanInteract] = React.useState(false);
  const [mediaViewerUrl, setMediaViewerUrl] = React.useState<string | null>(null);
  const hasCustomContract = Boolean(contractUrl);
  const confirmationLockedRef = React.useRef(false);
  const [rendered, setRendered] = React.useState(visible);
  const modalProgress = useSharedValue(visible ? 1 : 0);
  const wasVisibleRef = React.useRef(visible);

  React.useEffect(() => {
    if (!visible) {
      setIsTermsAccepted(false);
      setIsContractAccepted(false);
      setShowTermsContent(false);
      setFeedbackVisible(false);
      setFeedbackMessage('');
      setCanInteract(false);
      confirmationLockedRef.current = false;
      return;
    }

    setCanInteract(false);
    confirmationLockedRef.current = false;
    const timeout = setTimeout(() => {
      setCanInteract(true);
    }, 180);

    return () => clearTimeout(timeout);
  }, [visible]);

  React.useEffect(() => {
    if (visible && !loading) {
      confirmationLockedRef.current = false;
    }
  }, [loading, visible]);

  const finishDismiss = React.useCallback(() => {
    setRendered(false);
  }, []);

  React.useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (visible) {
      if (!rendered) {
        setRendered(true);
        modalProgress.value = 0;
      }

      if (!wasVisible) {
        modalProgress.value = withTiming(1, {
          duration: 220,
          easing: motion.easing.standard,
        });
      }
      return;
    }

    if (!rendered) {
      return;
    }

    modalProgress.value = withTiming(0, {
      duration: 180,
      easing: motion.easing.exit,
    }, (finished) => {
      if (finished) {
        runOnJS(finishDismiss)();
      }
    });
  }, [finishDismiss, modalProgress, rendered, visible]);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(modalProgress.value, [0, 1], [0, 1]),
  }));

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(modalProgress.value, [0, 1], [0, 1]),
  }));

  const hasRequiredInputValue = requiredInputValue !== undefined && requiredInputValue !== null;
  const normalizedInput = normalizeVisibleInput(inputValue);
  const hasEmptyRequiredInput = showInput && !normalizedInput;
  const hasMismatchedRequiredInput =
    showInput &&
    hasRequiredInputValue &&
    !hasEmptyRequiredInput &&
    normalizeConfirmationInput(inputValue) !== normalizeConfirmationInput(requiredInputValue);

  const isConfirmDisabled =
    hasEmptyRequiredInput ||
    hasMismatchedRequiredInput ||
    confirmDisabled ||
    (requireTermsAcceptance && !isTermsAccepted) ||
    (hasCustomContract && !isContractAccepted);
  const isConfirmButtonDisabled = !canInteract || loading || isConfirmDisabled;

  const getValidationFeedback = () => {
    if (hasEmptyRequiredInput) {
      return inputPlaceholder
        ? `Please fill in "${inputPlaceholder.replace(/\.+$/, '')}" before continuing.`
        : 'Please fill in the required field before continuing.';
    }

    if (hasMismatchedRequiredInput) {
      return hasRequiredInputValue
        ? `Please type "${requiredInputValue}" to confirm.`
        : 'Please complete the confirmation requirement before continuing.';
    }

    if (requireTermsAcceptance && !isTermsAccepted) {
      return 'Please accept the terms and conditions before continuing.';
    }

    if (hasCustomContract && !isContractAccepted) {
      return 'Please read and accept the custom contract before continuing.';
    }

    if (confirmDisabled) {
      return 'Please complete the required information before continuing.';
    }

    return null;
  };

  const handleConfirmPress = () => {
    if (!canInteract || loading || confirmationLockedRef.current) {
      return;
    }

    const validationFeedback = getValidationFeedback();
    if (validationFeedback) {
      setFeedbackMessage(validationFeedback);
      setFeedbackVisible(true);
      return;
    }

    confirmationLockedRef.current = true;
    try {
      const result = onConfirm ? onConfirm() : onClose();
      void Promise.resolve(result).finally(() => {
        confirmationLockedRef.current = false;
      });
    } catch (error) {
      confirmationLockedRef.current = false;
      throw error;
    }
  };

  const renderCheckbox = (checked: boolean) => (
    <View
      style={[
        styles.checkbox,
        {
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : 'transparent'
        }
      ]}
    >
      {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
    </View>
  );

  if (!rendered) {
    return null;
  }

  return (
    <RNModal
      animationType="none"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
      visible={rendered}
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, overlayAnimatedStyle]}>
        <Animated.View
          style={[
            styles.modalContainer,
            modalAnimatedStyle,
            {
              backgroundColor: colors.card,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 10
            },
          ]}
        >
          {loading ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
              <Text style={[styles.message, { color: colors.textSecondary, marginBottom: 0 }]}>{loadingMessage}</Text>
            </>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
            >
              {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
              <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

              {summaryItems.length > 0 && (
                <View style={[styles.summaryCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {summaryItems
                    .filter((item) => item.value !== null && item.value !== undefined && String(item.value).trim().length > 0)
                    .map((item, index) => (
                      <View
                        key={`${item.label}-${index}`}
                        style={[
                          styles.summaryRow,
                          index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 },
                        ]}
                      >
                        <View style={styles.summaryLabelWrap}>
                          {item.icon ? <Ionicons name={item.icon} size={15} color={colors.textSecondary} /> : null}
                          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                        </View>
                        <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={2}>
                          {String(item.value)}
                        </Text>
                      </View>
                    ))}
                </View>
              )}

              {showInput && (
                <TextInput
                  testID="app-modal-input"
                  accessibilityLabel="app-modal-input"
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      minHeight: inputMultiline ? 80 : 48,
                      textAlign: inputMultiline ? 'left' : 'center',
                      textAlignVertical: inputMultiline ? 'top' : 'center',
                    }
                  ]}
                  placeholder={inputPlaceholder}
                  placeholderTextColor={colors.textSecondary}
                  onChangeText={onInputChange}
                  value={inputValue}
                  multiline={inputMultiline}
                  numberOfLines={inputMultiline ? 3 : 1}
                  autoCapitalize="none"
                  showSoftInputOnFocus={!isE2EFixtureMode()}
                />
              )}

              {hasCustomContract && (
                <View
                  style={[
                    styles.agreementCard,
                    {
                      borderColor: isContractAccepted ? colors.primary : colors.border,
                      backgroundColor: colors.background
                    }
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setIsContractAccepted((prev) => !prev)}
                    style={styles.agreementPressable}
                  >
                    {renderCheckbox(isContractAccepted)}
                    <Text style={[styles.termsText, { color: colors.text }]}>
                      I have read and agree to the custom contract from{' '}
                      <Text style={styles.termsStrong}>{contractName || 'the provider'}</Text>.
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setMediaViewerUrl(contractUrl || null)}
                    style={styles.inlineLinkButton}
                  >
                    <Ionicons name="document-text-outline" size={15} color={colors.primary} />
                    <Text style={[styles.termsLinkText, { color: colors.primary }]}>View Custom Contract</Text>
                  </TouchableOpacity>
                </View>
              )}

              {requireTermsAcceptance && (
                <View
                  style={[
                    styles.agreementCard,
                    {
                      borderColor: isTermsAccepted ? colors.primary : colors.border,
                      backgroundColor: colors.background
                    }
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setIsTermsAccepted((prev) => !prev)}
                    style={styles.agreementPressable}
                  >
                    {renderCheckbox(isTermsAccepted)}
                    <Text style={[styles.termsText, { color: colors.text }]}>{termsLabel}</Text>
                  </TouchableOpacity>

                  {onTermsPress ? (
                    <TouchableOpacity
                      onPress={onTermsPress}
                      activeOpacity={1}
                      style={styles.inlineLinkButton}
                    >
                      <Ionicons name="reader-outline" size={15} color={colors.primary} />
                      <Text style={[styles.termsLinkText, { color: colors.primary }]}>{termsLinkLabel}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => setShowTermsContent(true)}
                      style={styles.inlineLinkButton}
                    >
                      <Ionicons name="reader-outline" size={15} color={colors.primary} />
                      <Text style={[styles.termsLinkText, { color: colors.primary }]}>{termsLinkLabel}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  testID="app-modal-confirm-button"
                  accessibilityLabel="app-modal-confirm-button"
                  activeOpacity={isConfirmButtonDisabled ? 1 : 0.78}
                  accessibilityState={{ disabled: isConfirmButtonDisabled }}
                  style={[
                    styles.confirmButton,
                    {
                      backgroundColor: isConfirmButtonDisabled
                        ? colors.border
                        : danger
                          ? '#EF4444'
                          : colors.primary,
                    }
                  ]}
                  disabled={isConfirmButtonDisabled}
                  onPress={handleConfirmPress}
                >
                  <Text
                    style={[
                      styles.confirmButtonText,
                      { color: isConfirmButtonDisabled ? colors.textSecondary : '#FFFFFF' },
                    ]}
                  >
                    {buttonText}
                  </Text>
                </TouchableOpacity>

                {showCancelButton ? (
                  <TouchableOpacity
                    testID="app-modal-cancel-button"
                    accessibilityLabel="app-modal-cancel-button"
                    activeOpacity={!canInteract ? 1 : 0.78}
                    style={styles.cancelButton}
                    disabled={!canInteract}
                    onPress={onClose}
                  >
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </Animated.View>

      <RNModal
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        hardwareAccelerated
        visible={showTermsContent}
        onRequestClose={() => setShowTermsContent(false)}
      >
        <View style={styles.termsOverlay}>
          <View style={[styles.termsContainer, { backgroundColor: colors.card }]}>
            <View style={styles.termsHeader}>
              <Text style={[styles.termsTitle, { color: colors.text }]}>Terms and Conditions</Text>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowTermsContent(false)}>
                <Text style={[styles.closeTermsText, { color: colors.primary }]}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.termsScrollContent}>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>This document is a legally binding agreement between you and Musika Lokal. By using our platform, you confirm you are at least 18 years of age.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>1. Booking and Payments (Escrow)</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>- All transactions are processed via the Musika Lokal Wallet.{"\n"}- Funds are held in escrow and released 48-72 hours after event completion if no dispute is raised.{"\n"}- Musika Lokal acts only as a facilitator and is not a party to the actual performance contract.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>2. Cancellation and Force Majeure</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>- All confirmed booking cancellations are non-refundable once payment has been made.{"\n"}- Paid downpayments and full payments are non-refundable and will not be returned after cancellation.{"\n"}- Provider availability issues, admin-reviewed incidents, verified access issues, and approved force majeure cases may be handled through rescheduling or support review, but booking payments remain non-refundable.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>3. Limitation of Liability</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>{'Musika Lokal is provided "as-is" and is not liable for personal injury or property damage during sessions/events, external payment network failures, or loss of income due to app downtime.'}</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>4. User Content and Intellectual Property</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>You retain ownership of uploaded content and grant Musika Lokal a non-exclusive license to display it for platform operations and promotion.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>5. Prohibited Conduct</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>Users must not circumvent platform payments, harass other users, post defamatory content, create fraudulent accounts/reviews, or submit repetitive, duplicate, misleading, or abusive applications, booking requests, production-team requests, gig applications, or studio bookings. Musika Lokal may block duplicate active requests, restrict repeated cancellations or reapplications, reject invalid or overlapping studio bookings, and require unpaid bookings to be settled before new bookings are made.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>6. Governing Law</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>These terms are governed by the laws of the Republic of the Philippines. Legal disputes shall be settled exclusively in the courts of Metro Manila.</Text>
            </ScrollView>
          </View>
        </View>
      </RNModal>

      <CustomAlert
        visible={feedbackVisible}
        type="warning"
        title="Required Field"
        message={feedbackMessage}
        forceModal
        onClose={() => setFeedbackVisible(false)}
      />
      <InAppMediaViewer
        visible={!!mediaViewerUrl}
        uri={mediaViewerUrl}
        title="Custom Contract"
        onClose={() => setMediaViewerUrl(null)}
      />
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
  },
  modalScroll: {
    width: '100%',
  },
  modalScrollContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 19,
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  confirmButton: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  cancelButton: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: 'Poppins_400Regular',
  },
  summaryCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  summaryLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },
  agreementCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  agreementPressable: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  termsStrong: {
    fontFamily: 'Poppins_600SemiBold',
  },
  termsText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
  },
  inlineLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 32,
    marginTop: 8,
    paddingVertical: 2,
    maxWidth: '86%',
  },
  termsLinkText: {
    flexShrink: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Poppins_500Medium',
    textDecorationLine: 'underline',
  },
  termsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  termsContainer: {
    width: '100%',
    maxHeight: '82%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  termsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  termsTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  closeTermsText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  termsScrollContent: {
    paddingBottom: 8,
  },
  termsSectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    marginTop: 12,
    marginBottom: 6,
  },
  termsBody: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
});

export default CustomModal;
