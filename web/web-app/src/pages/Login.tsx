import { useEffect, useState } from "react";
import {
    IoEyeOffOutline,
    IoEyeOutline,
    IoLockClosedOutline,
    IoMailOutline,
} from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import CustomAlert, { AlertType } from "../components/CustomAlert";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface AlertState {
  visible: boolean;
  type: AlertType;
  title: string;
  message: string;
  buttons: {
    text: string;
    onPress?: () => void;
    style?: "default" | "cancel" | "destructive";
  }[];
}

export default function LoginPage() {
  const { colors, isDark } = useTheme();
  const { setGuestMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const verified = searchParams.get("verified");
  const accountCreated = searchParams.get("accountCreated");
  const createdEmail = searchParams.get("email");
  const verificationError = searchParams.get("verification_error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [loginMessage, setLoginMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    type: "info",
    title: "",
    message: "",
    buttons: [{ text: "OK" }],
  });

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: AlertState["buttons"],
  ) => {
    setAlertState({
      visible: true,
      type,
      title,
      message,
      buttons: buttons || [{ text: "OK" }],
    });
  };

  useEffect(() => {
    if (verificationError) {
      const errorMap: Record<string, { title: string; message: string }> = {
        invalid_id: {
          title: "Invalid I.D.",
          message:
            "Your I.D. was declined. Please try again with a valid government-issued I.D.",
        },
        abandoned: {
          title: "Verification Incomplete",
          message:
            "You did not complete the verification process. Please try signing up again.",
        },
        pending_review: {
          title: "Verification Pending",
          message:
            "Your verification is under manual review. Please check your email later.",
        },
        timeout: {
          title: "Verification Timeout",
          message:
            "We could not confirm your verification status in time. Please try again.",
        },
      };
      const err = errorMap[verificationError] || {
        title: "Verification Failed",
        message: "Your identity could not be verified. Please try again.",
      };
      showAlert("warning", err.title, err.message, [{ text: "OK" }]);
      setSearchParams({});
    }
  }, [verificationError]);

  useEffect(() => {
    if (accountCreated === "true") {
      showAlert(
        "success",
        "Check Your Inbox",
        `We sent a verification link to ${createdEmail || "your email"}.\n\nPlease confirm your email address to log in.`,
      );
    } else if (verified === "true") {
      showAlert(
        "success",
        "Verification Successful! 🎉",
        "Your identity has been verified. You can now log in.",
      );
    }
  }, [verified, accountCreated, createdEmail]);

  const handleLogin = async () => {
    setErrors({});
    setLoginMessage(null);
    const newErrors: { email?: string; password?: string } = {};

    if (!email) newErrors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = "Please enter a valid email address.";
    if (!password) newErrors.password = "Password is required.";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await supabase.auth.signOut({ scope: "local" });

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setLoginMessage({
            type: "error",
            text: "Invalid email or password.",
          });
        } else if (error.message.includes("Email not confirmed")) {
          setLoginMessage({
            type: "error",
            text: "Email not confirmed. Check your inbox.",
          });
        } else if (error.message.includes("rate") || error.status === 429) {
          setLoginMessage({
            type: "error",
            text: "Too many attempts. Please wait.",
          });
        } else {
          setLoginMessage({ type: "error", text: error.message });
        }
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const metaVerified = user.user_metadata?.is_verified;
          if (metaVerified === false) {
            await supabase.auth.signOut();
            setLoginMessage({
              type: "error",
              text: "Account not verified. Please complete verification.",
            });
            return;
          }

          let { data: profile } = await supabase
            .from("profiles")
            .select("is_verified, id_document_expiry")
            .eq("id", user.id)
            .maybeSingle();

          if (!profile && metaVerified) {
            await supabase.from("profiles").upsert({
              id: user.id,
              email: user.email,
              full_name:
                user.user_metadata?.full_name || user.user_metadata?.name || "",
              role: user.user_metadata?.role || "musician",
              is_verified: true,
              verification_status: "APPROVED",
              didit_session_id: user.user_metadata?.didit_session_id,
            });
            const { data: newProfile } = await supabase
              .from("profiles")
              .select("is_verified, id_document_expiry")
              .eq("id", user.id)
              .maybeSingle();
            profile = newProfile;
          }

          if (!profile || !profile.is_verified) {
            await supabase.auth.signOut();
            showAlert(
              "warning",
              "Verification Required",
              !profile
                ? "Account setup incomplete. Please verify your identity."
                : "You need to verify your identity before accessing the app.",
              [{ text: "OK" }],
            );
          } else if (
            profile?.id_document_expiry &&
            new Date(profile.id_document_expiry) < new Date()
          ) {
            await supabase.auth.signOut();
            showAlert(
              "warning",
              "ID Document Expired",
              "Your ID document has expired. Please update your verification.",
            );
          } else {
            navigate("/home", { replace: true });
          }
        }
      }
    } catch {
      showAlert(
        "error",
        "Connection Error",
        "Unable to connect. Please check your internet connection.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsGuest = async () => {
    await supabase.auth.signOut({ scope: "local" });
    setGuestMode(true);
    navigate("/home", { replace: true });
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: colors.background }}
    >
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="mb-12 flex flex-col items-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-indigo-600 shadow-lg shadow-indigo-600/30">
            <span className="text-4xl font-bold text-white">M</span>
          </div>
          <h1
            className="mb-2 text-3xl font-bold"
            style={{ color: colors.text }}
          >
            MusikaLokal
          </h1>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Connect with the local music scene
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Email */}
          <div>
            <label
              className="mb-2 block text-xs font-bold uppercase tracking-wider"
              style={{ color: colors.textSecondary }}
            >
              Email Address
            </label>
            <div
              className={`flex h-14 items-center gap-3 rounded-2xl border px-4 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${
                errors.email ? "border-red-500" : ""
              }`}
              style={{
                backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                borderColor: errors.email
                  ? "#EF4444"
                  : isDark
                    ? "#374151"
                    : "#E5E7EB",
              }}
            >
              <IoMailOutline size={20} color={colors.textSecondary} />
              <input
                type="email"
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="name@email.com"
                style={{ color: colors.text }}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                autoComplete="email"
              />
            </div>
            {errors.email && (
              <p className="mt-1 ml-1 text-xs text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              className="mb-2 block text-xs font-bold uppercase tracking-wider"
              style={{ color: colors.textSecondary }}
            >
              Password
            </label>
            <div
              className={`flex h-14 items-center gap-3 rounded-2xl border px-4 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${
                errors.password ? "border-red-500" : ""
              }`}
              style={{
                backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                borderColor: errors.password
                  ? "#EF4444"
                  : isDark
                    ? "#374151"
                    : "#E5E7EB",
              }}
            >
              <IoLockClosedOutline size={20} color={colors.textSecondary} />
              <input
                type={showPassword ? "text" : "password"}
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Enter your password"
                style={{ color: colors.text }}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password)
                    setErrors({ ...errors, password: undefined });
                }}
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <IoEyeOffOutline size={20} color={colors.textSecondary} />
                ) : (
                  <IoEyeOutline size={20} color={colors.textSecondary} />
                )}
              </button>
            </div>
            {errors.password ? (
              <p className="mt-1 ml-1 text-xs text-red-500">
                {errors.password}
              </p>
            ) : (
              <div className="mt-2 text-right">
                <button
                  onClick={() => navigate("/forgot-password")}
                  className="text-xs font-medium hover:underline"
                  style={{ color: colors.primary }}
                >
                  Forgot Password?
                </button>
              </div>
            )}
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-primary w-full mt-4"
          >
            {loading ? <span className="spinner" /> : "Sign In"}
          </button>

          {/* Guest */}
          <button
            onClick={handleContinueAsGuest}
            className="btn-secondary w-full"
          >
            Continue as Guest
          </button>

          {/* Login Message */}
          {loginMessage && (
            <div
              className={`mt-4 rounded-lg p-3 text-center text-sm font-medium ${
                loginMessage.type === "error"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-emerald-500/10 text-emerald-500"
              }`}
            >
              {loginMessage.text}
            </div>
          )}

          {/* Sign Up Link */}
          <p
            className="mt-6 text-center text-sm"
            style={{ color: colors.textSecondary }}
          >
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="font-semibold hover:underline"
              style={{ color: colors.primary }}
            >
              Create Account
            </button>
          </p>
        </div>
      </div>

      <CustomAlert
        visible={alertState.visible}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState((p) => ({ ...p, visible: false }))}
      />
    </div>
  );
}
