import { useEffect, useState } from "react";
import {
    IoAddCircleOutline,
    IoCalendarOutline,
    IoCashOutline,
  IoChevronBack,
  IoCreateOutline
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

const formatPermitStatus = (status: string | null | undefined) => {
  const normalized = String(status || "pending_review").toLowerCase();
  if (["approved", "approved_by_admin", "verified"].includes(normalized)) return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "resubmitted") return "Resubmitted";
  if (["pending", "pending_review", "in_review", "under_review"].includes(normalized)) return "Pending Review";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export default function MyVenuePage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [gigs, setGigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchGigs = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("gigs")
      .select("*, gig_media(url)")
      .eq("organizer_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setGigs(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchGigs();
  }, [user]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("gigs").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchGigs();
  };

  const statusColor = (s: string) =>
    s === "open"
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : s === "closed"
        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";

  return (
    <div className="page-container">
      <div className="content-container max-w-3xl pt-6 pb-32">
        <div className="mb-6 flex items-center gap-3">
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
            My Gigs
          </h1>
          <button
            onClick={() => navigate("/add-gig")}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoAddCircleOutline size={26} color={colors.primary} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="spinner" />
          </div>
        ) : gigs.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              No gigs yet.
            </p>
            <button
              className="btn-primary mt-4"
              onClick={() => navigate("/add-gig")}
            >
              Post a Gig
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {gigs.map((g) => (
              (() => {
                const normalizedPermitStatus = String(g.permit_status || "pending_review").toLowerCase();
                const isRejected = normalizedPermitStatus === "rejected";
                const isPendingLike = ["pending", "pending_review", "resubmitted"].includes(normalizedPermitStatus);

                return (
              <div
                key={g.id}
                className="cursor-pointer rounded-2xl border overflow-hidden transition hover:shadow-md"
                style={{
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  backgroundColor: isDark ? "#1F2937" : "#fff",
                }}
                onClick={() => navigate(`/manage-gig?id=${g.id}`)}
              >
                {g.gig_media?.[0] ? (
                  <img
                    src={g.gig_media[0].url}
                    alt=""
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-36 items-center justify-center bg-gray-100 dark:bg-gray-700">
                    <span className="text-3xl">🎤</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3
                      className="text-sm font-bold"
                      style={{ color: colors.text }}
                    >
                      {g.name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(g.status)}`}
                    >
                      {g.status}
                    </span>
                  </div>
                  {/* Permit status badge */}
                  <div className="mt-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      ["approved", "approved_by_admin", "verified"].includes(normalizedPermitStatus) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      g.permit_status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      g.permit_status === "resubmitted" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}>
                      Permit: {formatPermitStatus(g.permit_status)}
                    </span>
                  </div>
                  {isRejected && g.permit_rejection_reason && (
                    <p className="mt-2 text-xs text-red-500 line-clamp-3">
                      Rejection reason: {g.permit_rejection_reason}
                    </p>
                  )}
                  {isPendingLike && (
                    <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                      Hidden from Home until permit review is completed.
                    </p>
                  )}
                  <div
                    className="mt-2 flex items-center gap-3 text-xs"
                    style={{ color: colors.textSecondary }}
                  >
                    {g.event_date && (
                      <span className="flex items-center gap-1">
                        <IoCalendarOutline size={12} />
                        {g.event_date}
                      </span>
                    )}
                    {g.budget && (
                      <span className="flex items-center gap-1">
                        <IoCashOutline size={12} />₱{g.budget.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(isRejected ? `/edit-gig?id=${g.id}&reapply=1` : `/edit-gig?id=${g.id}`);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:underline"
                    >
                      <IoCreateOutline size={14} />
                      {isRejected ? "Edit & Reapply" : "Edit Gig"}
                    </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(g.id);
                    }}
                    className="mt-2 text-xs text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                  </div>
                </div>
              </div>
                );
              })()
            ))}
          </div>
        )}
      </div>
      <ConfirmModal
        visible={!!deleteId}
        title="Delete Gig"
        message="Are you sure?"
        buttonText="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
