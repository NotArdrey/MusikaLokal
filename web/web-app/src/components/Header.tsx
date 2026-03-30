import { useCallback, useEffect, useMemo, useState } from "react";
import {
    IoAdd,
    IoArrowBack,
    IoChatbubbles,
    IoNotifications,
} from "react-icons/io5";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";
import NotificationPanel from "./NotificationPanel";

interface HeaderProps {
  title: string;
  transparent?: boolean;
  onBackPress?: () => void;
}

export default function Header({
  title,
  transparent,
  onBackPress,
}: HeaderProps) {
  const { colors, isDark } = useTheme();
  const { isGuest } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [hasUnread, setHasUnread] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const isMainNavPath = useMemo(
    () =>
      [
        "/home",
        "/discover",
        "/manage",
        "/bookings",
        "/ai-suggestions",
      ].includes(pathname),
    [pathname],
  );

  const isSettingsOrProfile = useMemo(
    () => pathname === "/settings" || pathname === "/profile",
    [pathname],
  );

  const isMyListingPath = useMemo(
    () => ["/my-group", "/my-venue", "/my-studio"].includes(pathname),
    [pathname],
  );

  const isManageDetailPath = useMemo(
    () => ["/manage-studio", "/manage-gig", "/manage-group"].includes(pathname),
    [pathname],
  );

  const backVisible =
    !!onBackPress ||
    !(
      isMainNavPath ||
      isSettingsOrProfile ||
      isMyListingPath ||
      isManageDetailPath
    );
  const notifVisible = isMainNavPath && !isGuest;
  const addVisible = isMyListingPath;

  const addRoute = useMemo(() => {
    if (pathname === "/my-venue") return "/add-gig";
    if (pathname === "/my-studio") return "/add-studio";
    return "/add-group";
  }, [pathname]);

  const checkUnreadNotifications = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const tokenExpiry = session.expires_at ? session.expires_at * 1000 : 0;
      if (tokenExpiry && tokenExpiry < Date.now()) return;

      const { data, error } = await supabase.functions.invoke(
        "manage-notifications",
        {
          body: { action: "unread_count", userId: session.user.id },
        },
      );
      if (!error && data) setHasUnread(data.count > 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkUnreadNotifications();
  }, [checkUnreadNotifications]);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 py-4 lg:px-8 lg:py-6 backdrop-blur-xl"
      style={{
        backgroundColor: transparent
          ? "transparent"
          : isDark
            ? "rgba(15, 23, 42, 0.85)"
            : "rgba(249, 250, 251, 0.85)",
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3 min-w-[40px]">
        {backVisible && (
          <button
            onClick={() => (onBackPress ? onBackPress() : navigate(-1))}
            className="rounded-full p-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            style={{ backgroundColor: isDark ? colors.surface : "#F3F4F6" }}
          >
            <IoArrowBack size={24} color={colors.text} />
          </button>
        )}
      </div>

      {/* Title */}
      <div className={`flex-1 ${!backVisible ? "text-left" : "text-center"}`}>
        <h1
          className={`font-semibold ${!backVisible ? "text-3xl lg:text-4xl font-bold tracking-tight" : "text-lg"}`}
          style={{ color: colors.text }}
        >
          {title}
        </h1>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 min-w-[40px] justify-end">
        {notifVisible && (
          <>
            <button
              onClick={() => navigate("/chat")}
              className="rounded-full p-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
              style={{ backgroundColor: isDark ? colors.surface : "#F3F4F6" }}
            >
              <IoChatbubbles size={24} color={colors.text} />
            </button>
            <button
              onClick={() => setNotifOpen(true)}
              className="relative rounded-full p-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
              style={{ backgroundColor: isDark ? colors.surface : "#F3F4F6" }}
            >
              <IoNotifications size={24} color={colors.text} />
              {hasUnread && (
                <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
              )}
            </button>
          </>
        )}
        {addVisible && (
          <button
            onClick={() => navigate(addRoute)}
            className="rounded-full p-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            style={{ backgroundColor: isDark ? colors.surface : "#F3F4F6" }}
          >
            <IoAdd size={24} color={colors.text} />
          </button>
        )}
      </div>

      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onUnreadChange={setHasUnread}
      />
    </header>
  );
}
