import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  ImageBackground,
  Image,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
import Modal from "../src/components/modal";
import { useTheme } from "../src/context/ThemeContext";

export default function ForgetPasswordScreen() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const isWebDesktop = Platform.OS === "web" && SCREEN_WIDTH >= 768;
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: "info",
    title: "",
    message: "",
  });

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Get the Expo deep link URL for password reset
  const getRedirectUrl = () => {
    // This creates exp://192.168.x.x:8082/--/change_password
    const url = Linking.createURL("change_password");
    console.log("Generated Expo redirect URL:", url);
    return url;
  };

  const handleSendResetLink = async () => {
    if (loading) return;
    setModalVisible(false);

    if (!email.trim()) {
      showAlert("error", "Error", "Please enter your email address.");
      return;
    }

    if (!validateEmail(email.trim())) {
      showAlert("error", "Error", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = getRedirectUrl();
      console.log("Password reset redirect URL:", redirectUrl);

      const { data, error } = await supabase.functions.invoke("account-email", {
        body: {
          action: "send_password_reset",
          email: email.trim(),
          redirectTo: redirectUrl,
        },
      });

      if (error || data?.error) {
        console.error("Password reset error:", error || data?.error);
        showAlert(
          "error",
          "Error",
          data?.error || error?.message || "Failed to send reset link. Please try again.",
        );
      } else {
        setSuccessModalVisible(true);
      }
    } catch (e: any) {
      console.error("Password reset exception:", e);
      showAlert("error", "Error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setSuccessModalVisible(false);
    router.back();
  };
  const canSubmitReset = validateEmail(email.trim());
  const isSubmitDisabled = loading || !canSubmitReset;

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.flex1, { backgroundColor: colors.background }]}
      >
        <ScrollView
          contentContainerStyle={
            isWebDesktop ? styles.webScrollContent : styles.scrollContent
          }
        >
        <ImageBackground 
            source={isWebDesktop ? { uri: 'https://images.unsplash.com/photo-1540039155732-68473638c4b0?q=80&w=2070&auto=format&fit=crop' } : undefined} 
            style={isWebDesktop ? {flex: 1, width: '100%'} : {}}
            imageStyle={isWebDesktop ? {} : {display: 'none'}}
        >
          <View
            style={
              isWebDesktop ? [styles.webContainer, { backgroundColor: 'transparent' }] : styles.contentContainer
            }
          >
            {/* Left Side Branding (Web Desktop Only) */}
            {isWebDesktop && (
              <View style={[styles.webLeftPanel, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                <View style={styles.webHeroOverlay}>
                  <View
                    style={[
                      styles.logoWrapper,
                      styles.shadow,
                      { marginBottom: 32 },
                    ]}
                  >
                    <Image
                      source={require("../assets/images/Musika-lokal-logo.png")}
                      style={styles.logoImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.webHeroTitle}>
                    Reset{"\n"}Password.
                  </Text>
                  <Text style={styles.webHeroSubtitle}>
                    Get back into your account and reconnect with the scene.
                  </Text>
                </View>
              </View>
            )}

            {/* Right Side Form */}
            <View
              style={
                isWebDesktop
                  ? [styles.webRightPanel, { backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.85)' }]
                  : null
              }
            >
              <View style={isWebDesktop ? styles.webFormWrapper : null}>
                {isWebDesktop ? (
                   <View style={{ marginBottom: 32 }}>
                     <TouchableOpacity activeOpacity={1} onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingVertical: 8, paddingRight: 16, alignSelf: 'flex-start' }}>
                       <Ionicons name="arrow-back" size={24} color={colors.text} />
                       <Text style={{ marginLeft: 8, fontSize: 16, fontFamily: 'Poppins_500Medium', color: colors.text }}>Back</Text>
                     </TouchableOpacity>
                     <Text style={{ textAlign: 'left', fontSize: 36, marginBottom: 8, color: colors.text, fontFamily: 'Poppins_700Bold' }}>Forgot Password</Text>
                     <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 18, color: colors.textSecondary }}>Reset your password below.</Text>
                   </View>
                ) : (
                   <Header title="Forgot Password" transparent={true} />
                )}

                <View style={styles.inputSection}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Email Address
                  </Text>

                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="example@email.com"
                      placeholderTextColor={colors.textSecondary}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                    We'll send a password reset link to this email.
                  </Text>
                </View>

                <View style={styles.buttonSection}>
                    <TouchableOpacity
                    activeOpacity={isSubmitDisabled ? 1 : 0.78}
                    style={[
                      styles.button,
                      { backgroundColor: canSubmitReset ? colors.primary : colors.border },
                      isSubmitDisabled && styles.buttonDisabled,
                    ]}
                    onPress={() => {
                      if (!email.trim()) {
                        showAlert("error", "Error", "Please enter your email address.");
                        return;
                      }
                      if (!validateEmail(email.trim())) {
                        showAlert(
                          "error",
                          "Error",
                          "Please enter a valid email address.",
                        );
                        return;
                      }
                      setModalVisible(true);
                    }}
                    disabled={isSubmitDisabled}
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={[styles.buttonText, { color: canSubmitReset ? "white" : colors.textSecondary }]}>Send Reset Link</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </ImageBackground>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Email"
        message={`Send a password reset link to ${email}?`}
        buttonText="Send Link"
        onConfirm={handleSendResetLink}
      />

      <Modal
        visible={successModalVisible}
        onClose={handleSuccessClose}
        title="Email Sent!"
        message="Check your inbox for a password reset link. When you tap the link, it should open directly in Expo Go. If you don't see the email, check your spam folder."
        buttonText="Back to Login"
        onConfirm={handleSuccessClose}
      />

      <Modal
        visible={loading}
        loading
        loadingMessage="Sending reset link..."
        onClose={() => { }}
      />

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  webScrollContent: {
    flexGrow: 1,
    height: "100%",
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  webContainer: {
    flex: 1,
    flexDirection: "row",
  },
  webLeftPanel: {
    flex: 1,
    display: "flex",
  },
  webHeroImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  webHeroOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 64,
    justifyContent: "center",
  },
  webHeroTitle: {
    color: "white",
    fontSize: 48,
    fontFamily: "Poppins_700Bold",
    lineHeight: 56,
    marginBottom: 16,
  },
  webHeroSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    fontFamily: "Poppins_400Regular",
    maxWidth: 400,
    lineHeight: 28,
  },
  webRightPanel: {
    flex: 1,
    maxWidth: 800,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: "auto",
    width: "100%",
    paddingVertical: 64,
  },
  webFormWrapper: {
    width: "100%",
    maxWidth: 500,
    paddingHorizontal: 32,
  },
  logoWrapper: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: 40,
    height: 40,
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  inputSection: {
    marginTop: 32,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontFamily: "Poppins_500Medium",
  },
  inputContainer: {
    width: "100%",
    paddingHorizontal: 20,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 16,
    fontFamily: "Poppins_400Regular",
    textAlignVertical: "center",
    paddingVertical: 0,
  },
  helperText: {
    fontSize: 12,
    marginTop: 8,
    marginLeft: 4,
    fontFamily: "Poppins_400Regular",
  },
  buttonSection: {
    marginTop: 16,
  },
  button: {
    width: "100%",
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6366f1",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
});
