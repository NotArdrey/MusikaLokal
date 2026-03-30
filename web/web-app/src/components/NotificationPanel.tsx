import { useCallback, useEffect, useState } from "react";
import { IoCheckmarkDone, IoClose, IoNotifications } from "react-icons/io5";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  onUnreadChange?: (hasUnread: boolean) => void;
}

export default function NotificationPanel({
  open,
  onClose,
  onUnreadChange,
}: NotificationPanelProps) {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && data) {
        setNotifications(data);
        onUnreadChange?.(data.some((n) => !n.is_read));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, onUnreadChange]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const markAllRead = async () => {
    if (!session?.user?.id) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", session.user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    onUnreadChange?.(false);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md transform shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
        }}
      >
        {/* Panel Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-5"
          style={{ borderColor: colors.border }}
        >
          <div className="flex items-center gap-3">
            <IoNotifications size={22} color={colors.primary} />
            <h2 className="text-lg font-bold" style={{ color: colors.text }}>
              Notifications
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.is_read) && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
                style={{ color: colors.primary }}
              >
                <IoCheckmarkDone size={16} />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <IoClose size={22} color={colors.text} />
            </button>
          </div>
        </div>

        {/* Panel Body */}
        <div className="h-[calc(100%-70px)] overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div
                className="spinner"
                style={{ color: colors.primary, width: 28, height: 28 }}
              />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <IoNotifications
                size={44}
                color={colors.muted}
                className="mb-3"
              />
              <p
                className="text-base font-semibold"
                style={{ color: colors.text }}
              >
                All Caught Up
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: colors.textSecondary }}
              >
                You have no notifications
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`rounded-xl border p-4 transition-all ${
                    !notif.is_read
                      ? "border-l-4 border-l-indigo-500 border-t-gray-200 border-r-gray-200 border-b-gray-200 dark:border-t-slate-700 dark:border-r-slate-700 dark:border-b-slate-700"
                      : "border-gray-200 dark:border-slate-700"
                  }`}
                  style={{
                    backgroundColor: !notif.is_read
                      ? isDark
                        ? "rgba(99,102,241,0.06)"
                        : "rgba(99,102,241,0.04)"
                      : isDark
                        ? colors.surface
                        : "#ffffff",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: colors.text }}
                      >
                        {notif.title}
                      </p>
                      <p
                        className="text-sm mt-1 leading-relaxed"
                        style={{ color: colors.textSecondary }}
                      >
                        {notif.message}
                      </p>
                      <p
                        className="text-xs mt-2"
                        style={{ color: colors.muted }}
                      >
                        {timeAgo(notif.created_at)}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
