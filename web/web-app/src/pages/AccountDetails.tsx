import { useEffect, useState } from "react";
import {
    IoChevronBack,
    IoChevronForward,
    IoMailOutline,
    IoMusicalNotesOutline,
    IoPersonOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function AccountDetailsPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("manage-profile", {
          body: { action: "get", user_id: user.id },
        });
        if (data?.profile) setProfile(data.profile);
      } catch {
        // fallback to direct query
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) setProfile(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const items = [
    { label: "Email", value: user?.email, icon: IoMailOutline },
    {
      label: "Name",
      value: profile?.full_name || "Not set",
      icon: IoPersonOutline,
    },
    {
      label: "Role",
      value: profile?.role || "musician",
      icon: IoMusicalNotesOutline,
    },
  ];

  const navItems = [
    { label: "Change Email", path: "/change-email" },
    { label: "Change Password", path: "/change-password" },
    { label: "Edit Profile", path: "/edit-profile" },
  ];

  return (
    <div className="page-container">
      <div className="content-container max-w-2xl pt-6 pb-32">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: colors.text }}>
            Account Details
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="spinner" />
          </div>
        ) : (
          <div className="space-y-6">
            <div
              className="card"
              style={{
                backgroundColor: isDark ? "#1F2937" : "#fff",
                borderColor: isDark ? "#374151" : "#E5E7EB",
              }}
            >
              <h3
                className="mb-4 text-sm font-semibold"
                style={{ color: colors.textSecondary }}
              >
                Personal Information
              </h3>
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <item.icon size={20} color={colors.primary} />
                    <div>
                      <div
                        className="text-xs"
                        style={{ color: colors.textSecondary }}
                      >
                        {item.label}
                      </div>
                      <div
                        className="text-sm font-medium"
                        style={{ color: colors.text }}
                      >
                        {item.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="flex w-full items-center justify-between rounded-xl border p-4 transition hover:opacity-80"
                  style={{
                    backgroundColor: isDark ? "#1F2937" : "#fff",
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  }}
                >
                  <span
                    className="text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    {item.label}
                  </span>
                  <IoChevronForward size={18} color={colors.textSecondary} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
