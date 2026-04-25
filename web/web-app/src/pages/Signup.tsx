import { useState } from "react";
import {
    IoCheckmarkCircle,
    IoChevronBack,
    IoChevronForward,
    IoEyeOffOutline,
    IoEyeOutline,
    IoLockClosedOutline,
    IoMailOutline,
    IoMusicalNotesOutline,
    IoPersonOutline,
    IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import CustomAlert, { AlertType } from "../components/CustomAlert";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

type Role = "musician";

const roles: {
  id: Role;
  label: string;
  desc: string;
  Icon: React.ComponentType<any>;
}[] = [
  {
    id: "musician",
    label: "Musician",
    desc: "Find gigs, collaborate, and grow your career",
    Icon: IoMusicalNotesOutline,
  },
];

const features = [
  "Connect with local musicians and venues",
  "Book studios and manage gigs easily",
  "Build your music career with smart tools",
  "Secure payments and verified profiles",
];

export default function SignupPage() {
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState(2);
  const [selectedRole, setSelectedRole] = useState<Role>("musician");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [alert, setAlert] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({ visible: false, type: "info", title: "", message: "" });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = "Full name is required.";
    if (!email) newErrors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = "Invalid email address.";
    if (!password) newErrors.password = "Password is required.";
    else if (password.length < 8)
      newErrors.password = "Must be at least 8 characters.";
    if (password !== confirmPassword)
      newErrors.confirmPassword = "Passwords do not match.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: selectedRole,
            is_verified: false,
          },
        },
      });

      if (error) {
        setAlert({
          visible: true,
          type: "error",
          title: "Signup Failed",
          message: error.message,
        });
      } else {
        navigate(`/?accountCreated=true&email=${encodeURIComponent(email)}`, {
          replace: true,
        });
      }
    } catch {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = () => {
    if (!password) return { width: "0%", color: "bg-gray-200", label: "" };
    if (password.length < 6)
      return { width: "25%", color: "bg-red-500", label: "Weak" };
    if (password.length < 8)
      return { width: "50%", color: "bg-orange-500", label: "Fair" };
    if (/(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/.test(password))
      return { width: "100%", color: "bg-emerald-500", label: "Strong" };
    return { width: "75%", color: "bg-indigo-500", label: "Good" };
  };

  const strength = passwordStrength();

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
          <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-indigo-300 rounded-full blur-2xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24 w-full">
          <div className="mb-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm mb-8">
              <span className="text-3xl font-bold text-white">M</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-bold text-white mb-4 leading-tight">
              Join the community
            </h2>
            <p className="text-lg text-indigo-200 leading-relaxed max-w-md">
              Thousands of local musicians, studios, and venues are already
              here. Create your account and start connecting today.
            </p>
          </div>

          <div className="space-y-4">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <IoCheckmarkCircle size={18} className="text-emerald-300" />
                </div>
                <span className="text-white/90 text-sm font-medium">
                  {feature}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-16 flex items-center gap-4">
            <div className="flex -space-x-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-10 rounded-full border-2 border-indigo-700 bg-gradient-to-br from-indigo-300 to-purple-400"
                />
              ))}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">2,000+ members</p>
              <p className="text-indigo-300 text-xs">and growing every day</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-lg">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
              <span className="text-lg font-bold text-white">M</span>
            </div>
            <span className="text-xl font-bold" style={{ color: colors.text }}>
              MusikaLokal
            </span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              {step > 2 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-full p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
                >
                  <IoChevronBack size={20} color={colors.text} />
                </button>
              )}
              <h1
                className="text-2xl lg:text-3xl font-bold"
                style={{ color: colors.text }}
              >
                Create your account
              </h1>
            </div>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Musician registration is currently available
            </p>
          </div>

          {/* Progress Steps */}
          <div className="mb-8 flex items-center gap-3">
            {[
              { num: 1, label: "Musician" },
              { num: 2, label: "Details" },
            ].map((s, i) => (
              <div key={s.num} className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      s.num < step
                        ? "bg-emerald-500 text-white"
                        : s.num === step
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                          : isDark
                            ? "bg-slate-700 text-slate-400"
                            : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {s.num < step ? <IoCheckmarkCircle size={18} /> : s.num}
                  </div>
                  <span
                    className="text-xs font-medium hidden sm:block"
                    style={{
                      color: s.num <= step ? colors.text : colors.textSecondary,
                    }}
                  >
                    {s.label}
                  </span>
                  {i === 0 && (
                    <div
                      className="flex-1 h-0.5 rounded-full mx-2"
                      style={{
                        backgroundColor:
                          step > 1 ? "#6366F1" : isDark ? "#334155" : "#E5E7EB",
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {step === 1 ? (
            /* Step 1: Role Selection */
            <div className="space-y-3 animate-fade-in">
              {roles.map((role) => {
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => {
                      setSelectedRole(role.id);
                      setStep(2);
                    }}
                    className={`group flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all duration-200 hover:shadow-lg ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-md shadow-indigo-500/10"
                        : "border-transparent hover:border-indigo-200 dark:hover:border-indigo-800"
                    }`}
                    style={{
                      backgroundColor: isSelected
                        ? undefined
                        : isDark
                          ? "#1E293B"
                          : "#F8FAFC",
                    }}
                  >
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all ${
                        isSelected
                          ? "bg-indigo-600 shadow-lg shadow-indigo-600/30"
                          : "bg-gray-100 dark:bg-slate-700 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30"
                      }`}
                    >
                      <role.Icon
                        size={24}
                        color={isSelected ? "#fff" : colors.textSecondary}
                      />
                    </div>
                    <div className="flex-1">
                      <p
                        className="text-base font-semibold"
                        style={{ color: colors.text }}
                      >
                        {role.label}
                      </p>
                      <p
                        className="text-sm mt-0.5"
                        style={{ color: colors.textSecondary }}
                      >
                        {role.desc}
                      </p>
                    </div>
                    <IoChevronForward
                      size={20}
                      className="text-gray-300 group-hover:text-indigo-400 transition-colors"
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            /* Step 2: Details */
            <div className="space-y-5 animate-fade-in">
              {/* Selected Role Badge */}
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "#EEF2FF",
                  color: "#6366F1",
                }}
              >
                <IoShieldCheckmarkOutline size={14} />
                Signing up as {roles.find((r) => r.id === selectedRole)?.label}
              </div>

              {/* Name & Email in a 2-col grid on desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                    style={{ color: colors.textSecondary }}
                  >
                    Full Name
                  </label>
                  <div
                    className={`flex h-12 items-center gap-3 rounded-xl border px-4 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${
                      errors.fullName ? "border-red-500" : ""
                    }`}
                    style={{
                      backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      borderColor: errors.fullName
                        ? "#EF4444"
                        : isDark
                          ? "#374151"
                          : "#E5E7EB",
                    }}
                  >
                    <IoPersonOutline size={18} color={colors.textSecondary} />
                    <input
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: colors.text }}
                      placeholder="Juan Dela Cruz"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (errors.fullName)
                          setErrors({ ...errors, fullName: "" });
                      }}
                    />
                  </div>
                  {errors.fullName && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                    style={{ color: colors.textSecondary }}
                  >
                    Email
                  </label>
                  <div
                    className={`flex h-12 items-center gap-3 rounded-xl border px-4 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${
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
                    <IoMailOutline size={18} color={colors.textSecondary} />
                    <input
                      type="email"
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: colors.text }}
                      placeholder="name@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) setErrors({ ...errors, email: "" });
                      }}
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500">{errors.email}</p>
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  Password
                </label>
                <div
                  className={`flex h-12 items-center gap-3 rounded-xl border px-4 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${
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
                  <IoLockClosedOutline size={18} color={colors.textSecondary} />
                  <input
                    type={showPassword ? "text" : "password"}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: colors.text }}
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password)
                        setErrors({ ...errors, password: "" });
                    }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <IoEyeOffOutline size={18} color={colors.textSecondary} />
                    ) : (
                      <IoEyeOutline size={18} color={colors.textSecondary} />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-500">{errors.password}</p>
                )}
                {/* Password strength meter */}
                {password && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <span
                      className="text-xs font-medium"
                      style={{ color: colors.textSecondary }}
                    >
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  Confirm Password
                </label>
                <div
                  className={`flex h-12 items-center gap-3 rounded-xl border px-4 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${
                    errors.confirmPassword ? "border-red-500" : ""
                  }`}
                  style={{
                    backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                    borderColor: errors.confirmPassword
                      ? "#EF4444"
                      : isDark
                        ? "#374151"
                        : "#E5E7EB",
                  }}
                >
                  <IoLockClosedOutline size={18} color={colors.textSecondary} />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: colors.text }}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword)
                        setErrors({ ...errors, confirmPassword: "" });
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? (
                      <IoEyeOffOutline size={18} color={colors.textSecondary} />
                    ) : (
                      <IoEyeOutline size={18} color={colors.textSecondary} />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              <button
                className="btn-primary w-full mt-3"
                onClick={handleSignup}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : "Create Account"}
              </button>

              <p
                className="text-center text-sm"
                style={{ color: colors.textSecondary }}
              >
                Already have an account?{" "}
                <button
                  onClick={() => navigate("/")}
                  className="font-semibold hover:underline"
                  style={{ color: colors.primary }}
                >
                  Sign In
                </button>
              </p>
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
