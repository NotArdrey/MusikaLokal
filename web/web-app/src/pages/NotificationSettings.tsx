import { useEffect, useState } from "react";
import { IoChevronBack } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface Prefs {
  booking_confirmed: boolean;
  awaiting_confirmation: boolean;
  upload_required: boolean;
  event_reminder: boolean;
  leave_review: boolean;
}

const defaultPrefs: Prefs = {
  booking_confirmed: true,
  awaiting_confirmation: true,
  upload_required: true,
  event_reminder: true,
  leave_review: true,
};

const labels: Record<keyof Prefs, string> = {
  booking_confirmed: "Booking Confirmed",
  awaiting_confirmation: "Awaiting Confirmation",
  upload_required: "Upload Required",
  event_reminder: "Event Reminder",
  leave_review: "Leave Review",
};

export default function NotificationSettingsPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setPrefs({
          booking_confirmed: data.booking_confirmed ?? true,
          awaiting_confirmation: data.awaiting_confirmation ?? true,
          upload_required: data.upload_required ?? true,
          event_reminder: data.event_reminder ?? true,
          leave_review: data.leave_review ?? true,
        });
      } else {
        await supabase
          .from("notification_preferences")
          .insert({ user_id: user.id, ...defaultPrefs });
      }
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (key: keyof Prefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    await supabase
      .from("notification_preferences")
      .update({ [key]: updated[key] })
      .eq("user_id", user!.id);
  };

  return (
    <div className="page-container">
      <div className="content-container max-w-lg pt-6 pb-32">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: colors.text }}>
            Notification Settings
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="spinner" />
          </div>
        ) : (
          <div className="space-y-3">
            {(Object.keys(labels) as (keyof Prefs)[]).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border p-4"
                style={{
                  backgroundColor: isDark ? "#1F2937" : "#fff",
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                }}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: colors.text }}
                >
                  {labels[key]}
                </span>
                <button
                  onClick={() => toggle(key)}
                  className={`relative h-7 w-12 rounded-full transition-colors ${prefs[key] ? "bg-indigo-500" : isDark ? "bg-gray-600" : "bg-gray-300"}`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${prefs[key] ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
