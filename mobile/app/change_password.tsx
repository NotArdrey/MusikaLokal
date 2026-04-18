import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
import { useTheme } from "../src/context/ThemeContext";

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams();

  // Check if this is a password reset flow (from email link)
  const isResetFlow = params.type === "recovery" || params.access_token;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
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

  // Handle the recovery token if present
  useEffect(() => {
    const handleRecoveryToken = async () => {
      if (params.access_token && params.refresh_token) {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token as string,
            refresh_token: params.refresh_token as string,
          });
          if (error) {
            console.error("Error setting session from recovery:", error);
            showAlert(
              "warning",
              "Link Expired",
              "Invalid or expired reset link. Please request a new one.",
            );
          }
        } catch (e) {
          console.error("Recovery token error:", e);
        }
      }
    };
    handleRecoveryToken();
  }, [params]);

  const validatePassword = (password: string) => {
    if (password.length < 6) {
      return "Password must be at least 6 characters";
    }
    return null;
  };

  const handleUpdatePassword = async () => {
    if (loading) return;
    setModalVisible(false);

    // Validate new password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      showAlert("warning", "Invalid Password", passwordError);
      return;
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      showAlert("warning", "Passwords Don't Match", "New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isResetFlow) {
        // Password reset flow - just update the password
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          console.error("Password update error:", error);
          showAlert("warning", "Update Failed", error.message || "Failed to update password.");
        } else {
          setSuccessModalVisible(true);
        }
      } else {
        // Regular password change - verify current password first
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.email) {
          showAlert("warning", "Verification Failed", "Unable to verify user. Please log in again.");
          return;
        }

        // Verify current password by attempting to sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

        if (signInError) {
          showAlert("warning", "Incorrect Password", "Current password is incorrect.");
          return;
        }

        // Update to new password
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          console.error("Password update error:", updateError);
          showAlert(
            "warning",
            "Update Failed",
            updateError.message || "Failed to update password.",
          );
        } else {
          setSuccessModalVisible(true);
        }
      }
    } catch (e: any) {
      console.error("Password change exception:", e);
      showAlert("warning", "Something Went Wrong", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setSuccessModalVisible(false);
    if (isResetFlow) {
      // Go to login after password reset
      router.replace("/");
    } else {
      // Go back to settings after regular password change
      router.back();
    }
  };

  const renderPasswordInput = (
    label: string,
    value: string,
    setValue: (text: string) => void,
    show: boolean,
    setShow: (show: boolean) => void,
    placeholder: string,
  ) => (
    <View style={styles.inputWrapper}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
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
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={setValue}
          secureTextEntry={!show}
        />
        <TouchableOpacity activeOpacity={1} style={styles.eyeIcon} onPress={() => setShow(!show)}>
          <Ionicons
            name={show ? "eye-outline" : "eye-off-outline"}
            size={22}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={isResetFlow ? "Reset Password" : "Change Password"} />

        <View style={styles.formContainer}>
          {/* Only show current password field if not in reset flow */}
          {!isResetFlow &&
            renderPasswordInput(
              "Current Password",
              currentPassword,
              setCurrentPassword,
              showCurrentPassword,
              setShowCurrentPassword,
              "Enter current password",
            )}

          {renderPasswordInput(
            "New Password",
            newPassword,
            setNewPassword,
            showNewPassword,
            setShowNewPassword,
            "Create a new password",
          )}

          {renderPasswordInput(
            "Confirm New Password",
            confirmPassword,
            setConfirmPassword,
            showConfirmPassword,
            setShowConfirmPassword,
            "Re-enter new password",
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity activeOpacity={1}
            style={[
              styles.button,
              {
                backgroundColor: colors.primary,
                shadowColor: "#6366F1",
              },
              loading && styles.buttonDisabled,
            ]}
            onPress={() => {
              // Validate before showing modal
              if (!isResetFlow && !currentPassword) {
                showAlert("warning", "Current Password Required", "Please enter your current password.");
                return;
              }
              if (!newPassword) {
                showAlert("warning", "New Password Required", "Please enter a new password.");
                return;
              }
              if (!confirmPassword) {
                showAlert("warning", "Confirmation Required", "Please confirm your new password.");
                return;
              }
              if (newPassword !== confirmPassword) {
                showAlert("warning", "Passwords Don't Match", "New passwords do not match.");
                return;
              }
              setModalVisible(true);
            }}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                {isResetFlow ? "Reset Password" : "Update Password"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={isResetFlow ? "Reset Password" : "Confirm Password Change"}
        message={
          isResetFlow
            ? "Set your new password?"
            : "Are you sure you want to change your password?"
        }
        buttonText="Confirm"
        onConfirm={handleUpdatePassword}
      />

      <Modal
        visible={successModalVisible}
        onClose={handleSuccessClose}
        title="Success!"
        message={
          isResetFlow
            ? "Your password has been reset successfully. You can now log in with your new password."
            : "Your password has been updated successfully."
        }
        buttonText="OK"
        onConfirm={handleSuccessClose}
      />

      <Modal
        visible={loading}
        loading
        loadingMessage="Updating password..."
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
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  formContainer: {
    marginTop: 32,
  },
  inputWrapper: {
    marginBottom: 24,
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
    position: "relative",
  },
  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 4,
    paddingRight: 32,
    fontFamily: "Poppins_400Regular",
    textAlignVertical: "center",
    paddingVertical: 0,
  },
  eyeIcon: {
    position: "absolute",
    right: 16,
  },
  buttonContainer: {
    marginTop: 8,
  },
  button: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
