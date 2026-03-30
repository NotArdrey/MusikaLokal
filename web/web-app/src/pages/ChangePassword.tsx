import { useState } from "react";
import { IoChevronBack, IoLockClosedOutline } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function ChangePasswordPage() {
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  const handleUpdate = async () => {
    if (password.length < 6) {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Password must be at least 6 characters.",
      });
      return;
    }
    if (password !== confirmPassword) {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Passwords do not match.",
      });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setAlert({
          visible: true,
          type: "error",
          title: "Error",
          message: error.message,
        });
      } else {
        setAlert({
          visible: true,
          type: "success",
          title: "Success",
          message: "Password updated.",
        });
        setTimeout(() => navigate("/settings"), 1500);
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
    <div className="page-container">
      <div className="content-container max-w-md pt-6 pb-32">
        <div className="mb-8 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: colors.text }}>
            Change Password
          </h1>
        </div>

        <div className="space-y-4">
          <div
            className="flex h-14 items-center gap-3 rounded-2xl border px-4"
            style={{
              backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
              borderColor: isDark ? "#374151" : "#E5E7EB",
            }}
          >
            <IoLockClosedOutline size={20} color={colors.textSecondary} />
            <input
              type="password"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: colors.text }}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div
            className="flex h-14 items-center gap-3 rounded-2xl border px-4"
            style={{
              backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
              borderColor: isDark ? "#374151" : "#E5E7EB",
            }}
          >
            <IoLockClosedOutline size={20} color={colors.textSecondary} />
            <input
              type="password"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: colors.text }}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
            />
          </div>
          <button
            className="btn-primary w-full"
            onClick={handleUpdate}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : "Update Password"}
          </button>
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
