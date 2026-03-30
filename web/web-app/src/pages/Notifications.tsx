import { useCallback, useEffect, useState } from "react";
import { IoCheckmarkDone, IoNotifications } from "react-icons/io5";
import Header from "../components/Header";
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

export default function NotificationsPage() {
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
        .limit(50);

      if (!error && data) setNotifications(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = async () => {
    if (!session?.user?.id) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", session.user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
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
    <div className="page-container">
      <Header title="Notifications" onBackPress={() => window.history.back()} />

      <div className="content-container pb-32">
        <div className="mx-auto max-w-2xl">
          {/* Actions */}
          {notifications.some((n) => !n.is_read) && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
                style={{ color: colors.primary }}
              >
                <IoCheckmarkDone size={16} />
                Mark all read
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div
                className="spinner"
                style={{ color: colors.primary, width: 32, height: 32 }}
              />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <IoNotifications
                size={48}
                color={colors.muted}
                className="mb-4"
              />
              <p
                className="text-lg font-semibold"
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
                  className={`card flex gap-3 transition-all ${
                    !notif.is_read ? "border-l-4 !border-l-indigo-500" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: colors.text }}
                    >
                      {notif.title}
                    </p>
                    <p
                      className="text-xs mt-0.5 line-clamp-2"
                      style={{ color: colors.textSecondary }}
                    >
                      {notif.message}
                    </p>
                    <p
                      className="text-[10px] mt-1.5"
                      style={{ color: colors.muted }}
                    >
                      {timeAgo(notif.created_at)}
                    </p>
                  </div>
                  {!notif.is_read && (
                    <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
