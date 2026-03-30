import { useEffect, useState } from "react";
import { IoChevronBack, IoStarOutline } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface PendingReview {
  id: string;
  entity_name: string;
  entity_image?: string;
  booking_id?: string;
  studio_id?: string;
  gig_id?: string;
  target_user_id?: string;
  completed_at: string;
}

export default function ToReviewPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Fetch completed bookings that haven't been reviewed yet
      const { data } = await supabase
        .from("studio_bookings")
        .select(
          "id, studio_id, gig_id, created_at, studios(name, media:studio_media(url))",
        )
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) {
        setReviews(
          data.map((b: any) => ({
            id: b.id,
            entity_name: b.studios?.name || "Booking",
            entity_image: b.studios?.media?.[0]?.url,
            booking_id: b.id,
            studio_id: b.studio_id,
            gig_id: b.gig_id,
            completed_at: b.created_at,
          })),
        );
      }
      setLoading(false);
    })();
  }, [user]);

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
            To Review
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="spinner" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-20 text-center">
            <IoStarOutline
              size={48}
              className="mx-auto mb-3 text-gray-300 dark:text-gray-600"
            />
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              No pending reviews
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-4 rounded-xl border p-4"
                style={{
                  backgroundColor: isDark ? "#1F2937" : "#fff",
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                }}
              >
                {r.entity_image ? (
                  <img
                    src={r.entity_image}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
                    <IoStarOutline size={24} className="text-indigo-500" />
                  </div>
                )}
                <div className="flex-1">
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: colors.text }}
                  >
                    {r.entity_name}
                  </h3>
                  <p
                    className="text-xs"
                    style={{ color: colors.textSecondary }}
                  >
                    Completed {new Date(r.completed_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-600 transition"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (r.booking_id) params.set("booking_id", r.booking_id);
                    if (r.studio_id) params.set("studio_id", r.studio_id);
                    if (r.gig_id) params.set("gig_id", r.gig_id);
                    params.set("name", r.entity_name);
                    navigate(`/submit-review?${params.toString()}`);
                  }}
                >
                  Leave Review
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
