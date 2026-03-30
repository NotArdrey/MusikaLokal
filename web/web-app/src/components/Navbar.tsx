import { useCallback, useEffect, useMemo, useState } from "react";
import {
    IoBriefcase,
    IoBriefcaseOutline,
    IoCalendar,
    IoCalendarOutline,
    IoCompass,
    IoCompassOutline,
    IoHome,
    IoHomeOutline,
    IoPerson,
    IoPersonOutline,
    IoShieldCheckmark,
    IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

const navItems = [
  {
    id: "home",
    label: "Home",
    route: "/home",
    ActiveIcon: IoHome,
    InactiveIcon: IoHomeOutline,
  },
  {
    id: "discover",
    label: "Discover",
    route: "/discover",
    ActiveIcon: IoCompass,
    InactiveIcon: IoCompassOutline,
  },
  {
    id: "activity",
    label: "Activity",
    route: "/bookings",
    ActiveIcon: IoCalendar,
    InactiveIcon: IoCalendarOutline,
  },
  {
    id: "manage",
    label: "Manage",
    route: "/manage",
    ActiveIcon: IoBriefcase,
    InactiveIcon: IoBriefcaseOutline,
  },
  {
    id: "profile",
    label: "Profile",
    route: "/profile",
    ActiveIcon: IoPerson,
    InactiveIcon: IoPersonOutline,
  },
];

export default function Navbar() {
  const { colors, isDark } = useTheme();
  const { isGuest, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [manageRoute, setManageRoute] = useState("/manage");

  const fetchUserRole = useCallback(async () => {
    if (isGuest) return;
    if (isAdmin) {
      setManageRoute("/admin");
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const { data, error } = await supabase.functions.invoke(
        "manage-profile",
        {
          body: { action: "fetch", userId: session.user.id },
        },
      );
      if (error) return;

      if (data?.role === "studio-owner") setManageRoute("/my-studio");
      else if (data?.role === "manager" || data?.role === "musician-member")
        setManageRoute("/my-group");
      else if (data?.role === "venue-owner") setManageRoute("/my-venue");
      else setManageRoute("/manage");
    } catch {
      setManageRoute("/manage");
    }
  }, [isGuest, isAdmin]);

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  const activeTab = useMemo(() => {
    if (pathname.includes("home")) return "home";
    if (pathname.includes("discover")) return "discover";
    if (pathname.includes("bookings")) return "activity";
    if (pathname.includes("ai-suggestions")) return "home";
    if (
      pathname.includes("profile") ||
      pathname.includes("settings") ||
      pathname.includes("wallet")
    )
      return "profile";
    if (
      pathname.startsWith("/admin")
    )
      return "manage";
    if (
      pathname === "/manage" ||
      pathname.startsWith("/manage/") ||
      pathname.includes("my-studio") ||
      pathname.includes("my-venue") ||
      pathname.includes("my-group") ||
      pathname.includes("manage-") ||
      pathname.includes("edit-") ||
      pathname.includes("add-")
    )
      return "manage";
    return "home";
  }, [pathname]);

  const resolvedNavItems = useMemo(() => {
    if (isAdmin) {
      return navItems.map((item) =>
        item.id === "manage"
          ? {
              ...item,
              label: "Admin",
              ActiveIcon: IoShieldCheckmark,
              InactiveIcon: IoShieldCheckmarkOutline,
            }
          : item,
      );
    }
    return navItems;
  }, [isAdmin]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 w-20 flex-col items-center border-r py-8 gap-2"
        style={{
          backgroundColor: isDark
            ? "rgba(15, 23, 42, 0.95)"
            : "rgba(255, 255, 255, 0.95)",
          borderColor: colors.border,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Logo */}
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xl">
          M
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1">
          {resolvedNavItems.map((item) => {
            const isActive = activeTab === item.id;
            const route = item.id === "manage" ? manageRoute : item.route;
            const Icon = isActive ? item.ActiveIcon : item.InactiveIcon;

            return (
              <button
                key={item.id}
                onClick={() => navigate(route)}
                className={`group flex flex-col items-center gap-1 rounded-2xl p-3 transition-all duration-200 w-16 ${
                  isActive
                    ? isDark
                      ? "bg-white/10"
                      : "bg-indigo-50"
                    : "hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
                title={item.label}
              >
                <Icon
                  size={24}
                  color={isActive ? colors.primary : colors.textSecondary}
                />
                <span
                  className={`text-[11px] font-medium ${isActive ? "" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                  style={{
                    color: isActive ? colors.primary : colors.textSecondary,
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex w-[90%] max-w-md items-center justify-around rounded-3xl border px-2 py-3 shadow-xl"
        style={{
          backgroundColor: isDark
            ? "rgba(15, 23, 42, 0.85)"
            : "rgba(255, 255, 255, 0.85)",
          borderColor: colors.border,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {resolvedNavItems.map((item) => {
          const isActive = activeTab === item.id;
          const route = item.id === "manage" ? manageRoute : item.route;
          const Icon = isActive ? item.ActiveIcon : item.InactiveIcon;

          return (
            <button
              key={item.id}
              onClick={() => navigate(route)}
              className={`flex flex-col items-center rounded-2xl p-3 transition-all ${
                isActive ? (isDark ? "bg-white/10" : "bg-black/5") : ""
              }`}
            >
              <div className="relative flex flex-col items-center">
                <Icon
                  size={26}
                  color={isActive ? colors.primary : colors.textSecondary}
                />
                <span
                  className="text-[10px] font-medium mt-0.5"
                  style={{
                    color: isActive ? colors.primary : colors.textSecondary,
                  }}
                >
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </nav>
    </>
  );
}
