import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import React from 'react';
import { ActivityIndicator, Modal as RNModal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type CustomModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
  buttonText?: string;
  showInput?: boolean;
  danger?: boolean;
  onInputChange?: (text: string) => void;
  inputValue?: string;
  inputPlaceholder?: string;
  inputMultiline?: boolean;
  confirmDisabled?: boolean;
  requireTermsAcceptance?: boolean;
  termsLabel?: string;
  onTermsPress?: () => void;
  termsLinkLabel?: string;
  contractUrl?: string | null;
  contractName?: string;
  loading?: boolean;
  loadingMessage?: string;
};

const IS_WEB = Platform.OS === 'web';

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
  confirmDisabled = false,
  requireTermsAcceptance = false,
  termsLabel = 'I agree to the Terms and Conditions.',
  onTermsPress,
  termsLinkLabel = 'Read Terms and Conditions',
  contractUrl,
  contractName,
  loading = false,
  loadingMessage = 'Please wait...'
}) => {
  const { colors } = useTheme();
  const [isTermsAccepted, setIsTermsAccepted] = React.useState(false);
  const [isContractAccepted, setIsContractAccepted] = React.useState(false);
  const [showTermsContent, setShowTermsContent] = React.useState(false);
  const hasCustomContract = Boolean(contractUrl);

  React.useEffect(() => {
    if (!visible) {
      setIsTermsAccepted(false);
      setIsContractAccepted(false);
      setShowTermsContent(false);
    }
  }, [visible]);

  const isConfirmDisabled =
    confirmDisabled ||
    (requireTermsAcceptance && !isTermsAccepted) ||
    (hasCustomContract && !isContractAccepted);

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

  return (
    <RNModal
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onRequestClose={onClose}
    >
      <BlurView intensity={60} tint="dark" style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.card,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 10
            }
          ]}
        >
          {loading ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
              <Text style={[styles.message, { color: colors.textSecondary, marginBottom: 0 }]}>{loadingMessage}</Text>
            </>
          ) : (
            <>
              {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
              <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

              {showInput && (
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background
                    }
                  ]}
                  placeholder={inputPlaceholder}
                  placeholderTextColor={colors.textSecondary}
                  onChangeText={onInputChange}
                  value={inputValue}
                  multiline={inputMultiline}
                  numberOfLines={inputMultiline ? 3 : 1}
                  autoCapitalize="none"
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
                    activeOpacity={0.85}
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
                    activeOpacity={0.75}
                    onPress={() => { if (contractUrl) Linking.openURL(contractUrl); }}
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
                    activeOpacity={0.85}
                    onPress={() => setIsTermsAccepted((prev) => !prev)}
                    style={styles.agreementPressable}
                  >
                    {renderCheckbox(isTermsAccepted)}
                    <Text style={[styles.termsText, { color: colors.text }]}>{termsLabel}</Text>
                  </TouchableOpacity>

                  {onTermsPress ? (
                    <TouchableOpacity
                      onPress={onTermsPress}
                      activeOpacity={0.75}
                      style={styles.inlineLinkButton}
                    >
                      <Ionicons name="reader-outline" size={15} color={colors.primary} />
                      <Text style={[styles.termsLinkText, { color: colors.primary }]}>{termsLinkLabel}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setShowTermsContent(true)}
                      activeOpacity={0.75}
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
                  activeOpacity={1}
                  style={[
                    styles.confirmButton,
                    {
                      backgroundColor: danger ? '#EF4444' : colors.primary,
                      opacity: isConfirmDisabled ? 0.6 : 1
                    }
                  ]}
                  disabled={isConfirmDisabled}
                  onPress={onConfirm || onClose}
                >
                  <Text style={styles.confirmButtonText}>{buttonText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={1}
                  style={[
                    styles.cancelButton,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  onPress={onClose}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </BlurView>

      <RNModal
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
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
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>- More than 7 days: 80% refund to client.{"\n"}- 3-7 days: 70% refund to client.{"\n"}- Less than 3 days: No refund; 100% to provider.{"\n\n"}In cases of extreme weather, government-mandated lockdowns, or national emergencies, either party may cancel without penalty, subject to verification.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>3. Limitation of Liability</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>{'Musika Lokal is provided "as-is" and is not liable for personal injury or property damage during sessions/events, external payment network failures, or loss of income due to app downtime.'}</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>4. User Content and Intellectual Property</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>You retain ownership of uploaded content and grant Musika Lokal a non-exclusive license to display it for platform operations and promotion.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>5. Prohibited Conduct</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>Users must not circumvent platform payments, harass other users, post defamatory content, or create fraudulent accounts/reviews.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>6. Governing Law</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>These terms are governed by the laws of the Republic of the Philippines. Legal disputes shall be settled exclusively in the courts of Metro Manila.</Text>
            </ScrollView>
          </View>
        </View>
      </RNModal>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: IS_WEB ? 16 : 0,
  },
  modalContainer: {
    width: IS_WEB ? '92%' : '86%',
    maxWidth: IS_WEB ? 460 : 560,
    borderRadius: IS_WEB ? 18 : 24,
    padding: IS_WEB ? 20 : 24,
    alignItems: 'center',
  },
  title: {
    fontSize: IS_WEB ? 18 : 20,
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: IS_WEB ? 18 : 24,
    lineHeight: IS_WEB ? 22 : 24,
    fontFamily: 'Poppins_400Regular',
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
    flexDirection: IS_WEB ? 'row-reverse' : 'column',
  },
  confirmButton: {
    width: '100%',
    flex: IS_WEB ? 1 : 0,
    borderRadius: 10,
    paddingVertical: 13,
    minHeight: 46,
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
    flex: IS_WEB ? 1 : 0,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 13,
    minHeight: 46,
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
    marginBottom: 18,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: 'Poppins_400Regular',
  },
  agreementCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  inlineLinkButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 32,
    marginTop: 8,
    paddingVertical: 2,
  },
  termsLinkText: {
    fontSize: 13,
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
    maxWidth: IS_WEB ? 680 : undefined,
    maxHeight: IS_WEB ? '78%' : '82%',
    borderRadius: 16,
    paddingHorizontal: IS_WEB ? 20 : 16,
    paddingVertical: IS_WEB ? 18 : 14,
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
