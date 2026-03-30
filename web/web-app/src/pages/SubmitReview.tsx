import { useState } from "react";
import { IoChevronBack, IoStar, IoStarOutline } from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function SubmitReviewPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const entityName = params.get("name") || "this booking";
  const bookingId = params.get("booking_id");
  const studioId = params.get("studio_id");
  const gigId = params.get("gig_id");
  const targetUserId = params.get("target_user_id");

  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  const handleSubmit = async () => {
    if (rating === 0) {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select a rating.",
      });
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("submit-review", {
        body: {
          reviewer_id: user.id,
          rating,
          feedback,
          booking_id: bookingId,
          studio_id: studioId,
          gig_id: gigId,
          target_user_id: targetUserId,
        },
      });
      if (error) throw error;
      setAlert({
        visible: true,
        type: "success",
        title: "Thank You!",
        message: "Your review has been submitted.",
      });
      setTimeout(() => navigate(-1), 1500);
    } catch {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to submit review.",
      });
    } finally {
      setLoading(false);
    }
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
            Leave a Review
          </h1>
        </div>

        <div className="text-center">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            How was your experience with
          </p>
          <p
            className="mt-1 text-lg font-semibold"
            style={{ color: colors.text }}
          >
            {entityName}
          </p>
        </div>

        {/* Stars */}
        <div className="my-8 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className="transition hover:scale-110"
            >
              {star <= rating ? (
                <IoStar size={40} className="text-yellow-400" />
              ) : (
                <IoStarOutline size={40} color={colors.textSecondary} />
              )}
            </button>
          ))}
        </div>

        <textarea
          className="input-field min-h-[120px] resize-none"
          placeholder="Share your experience (optional)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />

        <button
          className="btn-primary mt-6 w-full"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : "Submit Review"}
        </button>
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
