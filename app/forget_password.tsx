import { router } from "expo-router";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
import { useTheme } from "../src/context/ThemeContext";

export default function ForgetPasswordScreen() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Get the Expo deep link URL for password reset
  const getRedirectUrl = () => {
    // This creates exp://192.168.x.x:8082/--/change_password
    const url = Linking.createURL('change_password');
    console.log('Generated Expo redirect URL:', url);
    return url;
  };

  const handleSendResetLink = async () => {
    setModalVisible(false);

    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }

    if (!validateEmail(email.trim())) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = getRedirectUrl();
      console.log("Password reset redirect URL:", redirectUrl);

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: redirectUrl,
        },
      );

      if (error) {
        console.error("Password reset error:", error);
        Alert.alert(
          "Error",
          error.message || "Failed to send reset link. Please try again.",
        );
      } else {
        setSuccessModalVisible(true);
      }
    } catch (e: any) {
      console.error("Password reset exception:", e);
      Alert.alert("Error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setSuccessModalVisible(false);
    router.back();
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Forgot Password" />

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
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              loading && styles.buttonDisabled,
            ]}
            onPress={() => {
              if (!email.trim()) {
                Alert.alert("Error", "Please enter your email address.");
                return;
              }
              if (!validateEmail(email.trim())) {
                Alert.alert("Error", "Please enter a valid email address.");
                return;
              }
              setModalVisible(true);
            }}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

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
        message="Check your inbox for a password reset link. If you don't see it, check your spam folder."
        buttonText="Back to Login"
        onConfirm={handleSuccessClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 4,
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
    marginTop: 32,
  },
  button: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
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
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
});
