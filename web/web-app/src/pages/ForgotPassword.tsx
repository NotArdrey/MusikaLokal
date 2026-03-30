import { useState } from "react";
import {
    IoArrowBack,
    IoCheckmarkCircle,
    IoLockClosedOutline,
    IoMailOutline,
    IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function ForgotPasswordPage() {
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  const handleReset = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/change-password`,
      });
      if (error) {
        setAlert({
          visible: true,
          type: "error",
          title: "Error",
          message: error.message,
        });
      } else {
        setSent(true);
      }
    } catch {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: colors.background }}
    >
      {/* Left Panel — decorative, hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-32 right-16 w-96 h-96 bg-purple-300 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24 w-full">
          <div className="mb-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm mb-8">
              <span className="text-3xl font-bold text-white">M</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-bold text-white mb-4 leading-tight">
              Don't worry,
              <br />
              we got you
            </h2>
            <p className="text-lg text-indigo-200 leading-relaxed max-w-md">
              It happens to the best of us. Reset your password in a few simple
              steps and get back to making music.
            </p>
          </div>

          <div className="space-y-5 mt-8">
            {[
              {
                icon: IoMailOutline,
                title: "Enter your email",
                desc: "The one linked to your account",
              },
              {
                icon: IoShieldCheckmarkOutline,
                title: "Check your inbox",
                desc: "We'll send a secure reset link",
              },
              {
                icon: IoLockClosedOutline,
                title: "Set a new password",
                desc: "Pick something strong and memorable",
              },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <step.icon size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">
                    {step.title}
                  </p>
                  <p className="text-indigo-300 text-xs mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
              <span className="text-lg font-bold text-white">M</span>
            </div>
            <span className="text-xl font-bold" style={{ color: colors.text }}>
              MusikaLokal
            </span>
          </div>

          {!sent ? (
            /* Email form */
            <div className="animate-fade-in">
              {/* Back link */}
              <button
                onClick={() => navigate(-1)}
                className="mb-6 flex items-center gap-2 text-sm font-medium transition-colors hover:text-indigo-600"
                style={{ color: colors.textSecondary }}
              >
                <IoArrowBack size={16} />
                Back to Sign In
              </button>

              <div className="mb-8">
                <div
                  className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(99,102,241,0.15)"
                      : "#EEF2FF",
                  }}
                >
                  <IoLockClosedOutline size={28} className="text-indigo-600" />
                </div>
                <h1
                  className="text-2xl lg:text-3xl font-bold mb-2"
                  style={{ color: colors.text }}
                >
                  Forgot your password?
                </h1>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: colors.textSecondary }}
                >
                  No worries! Enter the email address associated with your
                  account and we'll send you a link to reset your password.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                    style={{ color: colors.textSecondary }}
                  >
                    Email Address
                  </label>
                  <div
                    className="flex h-12 items-center gap-3 rounded-xl border px-4 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
                    style={{
                      backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                    }}
                  >
                    <IoMailOutline size={18} color={colors.textSecondary} />
                    <input
                      type="email"
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: colors.text }}
                      placeholder="name@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleReset()}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <button
                  className="btn-primary w-full"
                  onClick={handleReset}
                  disabled={loading || !email}
                >
                  {loading ? <span className="spinner" /> : "Send Reset Link"}
                </button>
              </div>

              <p
                className="mt-8 text-center text-sm"
                style={{ color: colors.textSecondary }}
              >
                Remember your password?{" "}
                <button
                  onClick={() => navigate("/")}
                  className="font-semibold hover:underline"
                  style={{ color: colors.primary }}
                >
                  Sign In
                </button>
              </p>
            </div>
          ) : (
            /* Success state */
            <div className="animate-fade-in text-center">
              <div
                className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                style={{
                  backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5",
                }}
              >
                <IoCheckmarkCircle size={48} className="text-emerald-500" />
              </div>

              <h1
                className="text-2xl lg:text-3xl font-bold mb-3"
                style={{ color: colors.text }}
              >
                Check your email
              </h1>
              <p
                className="text-sm leading-relaxed mb-2"
                style={{ color: colors.textSecondary }}
              >
                We've sent a password reset link to
              </p>
              <p
                className="text-base font-semibold mb-8"
                style={{ color: colors.text }}
              >
                {email}
              </p>

              <div
                className="rounded-xl p-4 mb-8 text-left"
                style={{
                  backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
                  borderColor: isDark ? "#334155" : "#E2E8F0",
                  border: "1px solid",
                }}
              >
                <p
                  className="text-xs font-medium mb-2"
                  style={{ color: colors.textSecondary }}
                >
                  Didn't receive the email?
                </p>
                <ul
                  className="text-xs space-y-1"
                  style={{ color: colors.textSecondary }}
                >
                  <li>• Check your spam or junk folder</li>
                  <li>• Make sure the email address is correct</li>
                  <li>• Wait a few minutes and try again</li>
                </ul>
              </div>

              <div className="space-y-3">
                <button
                  className="btn-primary w-full"
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                >
                  Try Another Email
                </button>
                <button
                  className="btn-secondary w-full"
                  onClick={() => navigate("/")}
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CustomAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onClose={() => setAlert((p) => ({ ...p, visible: false }))}
      />
    </div>
  );
}
