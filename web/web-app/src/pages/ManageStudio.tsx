import { useEffect, useState } from "react";
import {
    IoCalendarOutline,
    IoCashOutline,
    IoChevronBack,
    IoCreateOutline,
    IoLocationOutline,
    IoStar,
    IoTrashOutline,
} from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import ConfirmModal from "../components/Modal";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function ManageStudioPage() {
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const studioId = params.get("id");

  const [studio, setStudio] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"about" | "bookings" | "reviews">("about");
  const [deleteModal, setDeleteModal] = useState(false);
  const [cancelBooking, setCancelBooking] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!studioId) return;
    (async () => {
      const [stRes, bkRes, rvRes] = await Promise.all([
        supabase
          .from("studios")
          .select("*, studio_media(id, url)")
          .eq("id", studioId)
          .single(),
        supabase
          .from("studio_bookings")
          .select("*, profiles:user_id(full_name, avatar_url)")
          .eq("studio_id", studioId)
          .order("booking_date", { ascending: false }),
        supabase
          .from("reviews")
          .select("*, profiles:reviewer_id(full_name, avatar_url)")
          .eq("studio_id", studioId)
          .order("created_at", { ascending: false }),
      ]);
      if (stRes.data) setStudio(stRes.data);
      if (bkRes.data) setBookings(bkRes.data);
      if (rvRes.data) setReviews(rvRes.data);
      setLoading(false);
    })();
  }, [studioId]);

  const handleCancelBooking = async () => {
    if (!cancelBooking) return;
    await supabase
      .from("studio_bookings")
      .update({ status: "cancelled", cancel_reason: cancelReason })
      .eq("id", cancelBooking);
    setBookings((prev) =>
      prev.map((b) =>
        b.id === cancelBooking ? { ...b, status: "cancelled" } : b,
      ),
    );
    setCancelBooking(null);
    setCancelReason("");
    setAlert({
      visible: true,
      type: "success",
      title: "Cancelled",
      message: "Booking cancelled.",
    });
  };

  const handleDelete = async () => {
    if (!studioId) return;
    await supabase.from("studios").delete().eq("id", studioId);
    navigate("/manage");
  };

  const tabs = ["about", "bookings", "reviews"] as const;
  const statusColor = (s: string) =>
    s === "confirmed"
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : s === "pending"
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";

  if (loading)
    return (
      <div className="page-container">
        <div className="flex justify-center py-20">
          <span className="spinner" />
        </div>
      </div>
    );
  if (!studio)
    return (
      <div className="page-container">
        <div
          className="py-20 text-center"
          style={{ color: colors.textSecondary }}
        >
          Studio not found
        </div>
      </div>
    );

  return (
    <div className="page-container">
      <div className="content-container max-w-3xl pt-6 pb-32">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1
            className="flex-1 text-xl font-bold"
            style={{ color: colors.text }}
          >
            {studio.name}
          </h1>
          <button
            onClick={() => navigate(`/edit-studio?id=${studioId}`)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoCreateOutline size={22} color={colors.primary} />
          </button>
          <button
            onClick={() => setDeleteModal(true)}
            className="rounded-full p-2 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <IoTrashOutline size={22} className="text-red-500" />
          </button>
        </div>

        {studio.studio_media?.[0] && (
          <img
            src={studio.studio_media[0].url}
            alt=""
            className="mb-4 h-48 w-full rounded-2xl object-cover"
          />
        )}

        <div
          className="mb-4 flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: isDark ? "#1F2937" : "#F3F4F6" }}
        >
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition ${tab === t ? "bg-white shadow dark:bg-gray-700" : ""}`}
              style={{ color: tab === t ? colors.text : colors.textSecondary }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "about" && (
          <div className="space-y-3">
            {/* Permit Status */}
            <div
              className="flex items-center gap-2 rounded-xl border p-3"
              style={{
                borderColor: isDark ? "#374151" : "#E5E7EB",
                backgroundColor: isDark ? "#1F2937" : "#fff",
              }}
            >
              <span className="text-sm font-medium" style={{ color: colors.text }}>Permit Status:</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                studio.permit_status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                studio.permit_status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                studio.permit_status === "resubmitted" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
              }`}>
                {(studio.permit_status || "pending_review").replace("_", " ")}
              </span>
              {studio.permit_status === "rejected" && studio.permit_rejection_reason && (
                <span className="text-xs text-red-500 ml-2">
                  ({studio.permit_rejection_reason})
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              <IoLocationOutline size={16} />
              {studio.location}
            </div>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              <IoCashOutline size={16} />₱{studio.price_per_hour}/hr
            </div>
            {studio.description && (
              <p
                className="text-sm leading-relaxed"
                style={{ color: colors.text }}
              >
                {studio.description}
              </p>
            )}
          </div>
        )}

        {tab === "bookings" && (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <p
                className="py-10 text-center text-sm"
                style={{ color: colors.textSecondary }}
              >
                No bookings yet
              </p>
            ) : (
              bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl border p-4"
                  style={{
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    backgroundColor: isDark ? "#1F2937" : "#fff",
                  }}
                >
                  <IoCalendarOutline size={20} color={colors.primary} />
                  <div className="flex-1">
                    <div
                      className="text-sm font-medium"
                      style={{ color: colors.text }}
                    >
                      {b.profiles?.full_name}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: colors.textSecondary }}
                    >
                      {b.booking_date} · {b.start_time} - {b.end_time}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(b.status)}`}
                  >
                    {b.status}
                  </span>
                  {b.status === "confirmed" && (
                    <button
                      onClick={() => setCancelBooking(b.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "reviews" && (
          <div className="space-y-3">
            {reviews.length === 0 ? (
              <p
                className="py-10 text-center text-sm"
                style={{ color: colors.textSecondary }}
              >
                No reviews yet
              </p>
            ) : (
              reviews.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border p-4"
                  style={{
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    backgroundColor: isDark ? "#1F2937" : "#fff",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex text-yellow-400">
                      {Array.from({ length: r.rating }, (_, i) => (
                        <IoStar key={i} size={14} />
                      ))}
                    </div>
                    <span
                      className="text-xs"
                      style={{ color: colors.textSecondary }}
                    >
                      {r.profiles?.full_name}
                    </span>
                  </div>
                  {r.feedback && (
                    <p className="mt-1 text-sm" style={{ color: colors.text }}>
                      {r.feedback}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        visible={deleteModal}
        title="Delete Studio"
        message="This action cannot be undone."
        buttonText="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteModal(false)}
      />
      <ConfirmModal
        visible={!!cancelBooking}
        title="Cancel Booking"
        message="Provide a reason for cancellation."
        buttonText="Cancel Booking"
        danger
        showInput
        inputPlaceholder="Reason"
        inputValue={cancelReason}
        onInputChange={setCancelReason}
        onConfirm={handleCancelBooking}
        onClose={() => {
          setCancelBooking(null);
          setCancelReason("");
        }}
      />
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
