import { BlurView } from 'expo-blur';
import React from 'react';
import { ActivityIndicator, Modal as RNModal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type CustomModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
  buttonText?: string;
  showInput?: boolean;
  danger?: boolean; // New prop for destructive actions
  onInputChange?: (text: string) => void;
  inputValue?: string;
  inputPlaceholder?: string;
  inputMultiline?: boolean;
  confirmDisabled?: boolean;
  requireTermsAcceptance?: boolean;
  termsLabel?: string;
  onTermsPress?: () => void;
  termsLinkLabel?: string;
  loading?: boolean;
  loadingMessage?: string;
};

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
  loading = false,
  loadingMessage = 'Please wait...'
}) => {
  const { colors } = useTheme();
  const [isTermsAccepted, setIsTermsAccepted] = React.useState(false);
  const [showTermsContent, setShowTermsContent] = React.useState(false);

  React.useEffect(() => {
    if (!visible) {
      setIsTermsAccepted(false);
      setShowTermsContent(false);
    }
  }, [visible]);

  const isConfirmDisabled =
    confirmDisabled || (requireTermsAcceptance && !isTermsAccepted);

  return (
    <RNModal
      animationType="fade"
      transparent={true}
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
              shadowColor: "#000",
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
              {title && (
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              )}
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

              {requireTermsAcceptance && (
                <>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => setIsTermsAccepted((prev) => !prev)}
                    activeOpacity={1}
                    style={styles.termsRow}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isTermsAccepted ? colors.primary : colors.border,
                          backgroundColor: isTermsAccepted ? colors.primary : 'transparent'
                        }
                      ]}
                    >
                      {isTermsAccepted ? (
                        <Text style={styles.checkboxTick}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.termsText, { color: colors.text }]}>{termsLabel}</Text>
                  </TouchableOpacity>

                  {onTermsPress && (
                    <TouchableOpacity
                      onPress={onTermsPress}
                      activeOpacity={1}
                      style={styles.termsLinkButton}
                    >
                      <Text style={[styles.termsLinkText, { color: colors.primary }]}>
                        {termsLinkLabel}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {!onTermsPress && (
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => setShowTermsContent(true)}
                      activeOpacity={1}
                      style={styles.termsLinkButton}
                    >
                      <Text style={[styles.termsLinkText, { color: colors.primary }]}>
                        {termsLinkLabel}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <View style={styles.buttonContainer}>
                <TouchableOpacity activeOpacity={1}
                  style={[
                    styles.confirmButton,
                    {
                      backgroundColor: danger ? '#EF4444' : colors.primary,
                    }
                  ]}
                  disabled={isConfirmDisabled}
                  onPress={onConfirm || onClose}
                >
                  <Text style={styles.confirmButtonText}>{buttonText}</Text>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={1}
                  style={styles.cancelButton}
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
        transparent={true}
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
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>• All transactions are processed via the Musika Lokal Wallet.{"\n"}• Funds are held in escrow and released 48–72 hours after event completion if no dispute is raised.{"\n"}• Musika Lokal acts only as a facilitator and is not a party to the actual performance contract.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>2. Cancellation and Force Majeure</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>• {'>'}7 days: 80% refund to client.{"\n"}• 3–7 days: 70% refund to client.{"\n"}• {'<'}3 days: No refund; 100% to provider.{"\n\n"}In cases of extreme weather, government-mandated lockdowns, or national emergencies, either party may cancel without penalty, subject to verification.</Text>

              <Text style={[styles.termsSectionTitle, { color: colors.text }]}>3. Limitation of Liability</Text>
              <Text style={[styles.termsBody, { color: colors.textSecondary }]}>Musika Lokal is provided "as-is" and is not liable for personal injury or property damage during sessions/events, external payment network failures, or loss of income due to app downtime.</Text>

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
  },
  modalContainer: {
    width: '80%', // w-4/5
    borderRadius: 24, // rounded-3xl
    padding: 24, // p-6
    alignItems: 'center',
  },
  title: {
    fontSize: 20, // text-xl
    marginBottom: 12, // mb-3
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
  },
  message: {
    fontSize: 14, // text-sm
    textAlign: 'center',
    marginBottom: 32, // mb-8
    lineHeight: 24, // leading-6
    fontFamily: 'Poppins_400Regular',
  },
  buttonContainer: {
    width: '100%',
    gap: 12, // gap-3
  },
  confirmButton: {
    width: '100%',
    borderRadius: 12, // rounded-xl
    paddingVertical: 14, // py-3.5
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 14, // text-sm
    fontFamily: 'Poppins_600SemiBold',
  },
  cancelButton: {
    width: '100%',
    borderRadius: 12, // rounded-xl
    paddingVertical: 14, // py-3.5
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14, // text-sm
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
  termsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    lineHeight: 14,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  termsLinkButton: {
    width: '100%',
    marginBottom: 16,
  },
  termsLinkText: {
    fontSize: 13,
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
