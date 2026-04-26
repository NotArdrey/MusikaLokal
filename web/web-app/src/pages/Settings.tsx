import { useCallback, useEffect, useState } from "react";
import {
    IoChevronBack,
    IoChevronForward,
    IoDocumentTextOutline,
    IoHelpCircleOutline,
    IoLogInOutline,
    IoLogOutOutline,
    IoMoon,
    IoPhonePortraitOutline,
    IoShieldCheckmarkOutline,
    IoShieldOutline,
    IoSunny,
    IoWalletOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function SettingsPage() {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme, setTheme, colors, isDark } = useTheme();
  const { isGuest, setGuestMode } = useAuth();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string | null>(null);

  const fetchUserRole = useCallback(async () => {
    if (isGuest) {
      setUserRole(null);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile) setUserRole(profile.role);
    }
  }, [isGuest]);

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  const handleLogout = async () => {
    setModalVisible(false);
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  const isOwner = userRole === "studio-owner" || userRole === "venue-owner";

  const settingsSections: Array<{
    title: string;
    items: Array<{
      label: string;
      Icon: React.ComponentType<any>;
      route: string;
    }>;
  }> = [];

  if (!isGuest) {
    settingsSections.push({
      title: "Preferences",
      items: [
        {
          label: "Account Security",
          Icon: IoShieldOutline,
          route: "/account-details",
        },
        {
          label: "Wallet",
          Icon: IoWalletOutline,
          route: "/wallet",
        },
      ],
    });
  }

  settingsSections.push({
    title: "Support & Legal",
    items: [
      {
        label: "Help & Support",
        Icon: IoHelpCircleOutline,
        route: "/help-support",
      },
      {
        label: "Terms and Conditions",
        Icon: IoDocumentTextOutline,
        route: "/terms-and-conditions",
      },
      {
        label: "Privacy Policy",
        Icon: IoShieldCheckmarkOutline,
        route: "/privacy-policy",
      },
    ],
  });

  const themeOptions = [
    { id: "light" as const, Icon: IoSunny, label: "Light" },
    { id: "dark" as const, Icon: IoMoon, label: "Dark" },
    { id: "system" as const, Icon: IoPhonePortraitOutline, label: "System" },
  ];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-8 pb-6 lg:px-8">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          <IoChevronBack size={24} color={colors.text} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
          Settings
        </h1>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-6 pb-40 lg:px-8">
        {/* Theme Section */}
        <div>
          <p
            className="mb-3 pl-1 text-sm font-semibold uppercase tracking-wider"
            style={{ color: colors.textSecondary }}
          >
            Appearance
          </p>
          <div className="card">
            <p
              className="mb-4 text-sm font-medium"
              style={{ color: colors.text }}
            >
              Theme Preference
            </p>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((item) => {
                const isActive = theme === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setTheme(item.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border py-4 text-sm font-medium transition-all ${
                      isActive
                        ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                        : "border-transparent hover:bg-gray-50 dark:hover:bg-slate-700"
                    }`}
                    style={{
                      borderColor: isActive ? colors.primary : colors.border,
                      color: isActive ? colors.primary : colors.textSecondary,
                    }}
                  >
                    <item.Icon size={22} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Settings Sections */}
        {settingsSections.map((section) => (
          <div key={section.title}>
            <p
              className="mb-3 pl-1 text-sm font-semibold uppercase tracking-wider"
              style={{ color: colors.textSecondary }}
            >
              {section.title}
            </p>
            <div className="card overflow-hidden !p-0">
              {section.items.map((item, i) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.route)}
                  className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  style={{
                    borderBottom:
                      i < section.items.length - 1
                        ? `1px solid ${colors.border}`
                        : "none",
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: isDark
                        ? colors.inputBackground
                        : "#F3F4F6",
                    }}
                  >
                    <item.Icon size={18} color={colors.text} />
                  </div>
                  <span
                    className="flex-1 text-base font-medium"
                    style={{ color: colors.text }}
                  >
                    {item.label}
                  </span>
                  <IoChevronForward size={18} color={colors.textSecondary} />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Logout / Sign In */}
        <div>
          <button
            onClick={async () => {
              if (isGuest) {
                setGuestMode(false);
                navigate("/", { replace: true });
                return;
              }
              setModalVisible(true);
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl p-4 text-base font-semibold transition-colors ${
              isGuest
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {isGuest ? (
              <IoLogInOutline size={20} />
            ) : (
              <IoLogOutOutline size={20} />
            )}
            {isGuest ? "Sign In" : "Log Out"}
          </button>

          <p
            className="mt-4 text-center text-xs"
            style={{ color: colors.textSecondary }}
          >
            Version 1.0.0 (Build 52)
          </p>
        </div>
      </div>
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Log Out"
        message="Are you sure you want to log out of your account?"
        buttonText="Log Out"
        danger
        onConfirm={handleLogout}
      />
    </div>
  );
}
