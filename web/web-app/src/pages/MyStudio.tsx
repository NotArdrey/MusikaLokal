import { useEffect, useState } from "react";
import {
    IoAddCircleOutline,
    IoChevronBack,
    IoStar,
    IoTrashOutline,
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

export default function MyStudioPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [studios, setStudios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchStudios = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("studios")
      .select("*, studio_media(url), reviews:reviews(rating), permit_status")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setStudios(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchStudios();
  }, [user]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("studios").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchStudios();
  };

  const avgRating = (reviews: { rating: number }[]) => {
    if (!reviews?.length) return null;
    return (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(
      1,
    );
  };

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
            My Studios
          </h1>
          <button
            onClick={() => navigate("/add-studio")}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoAddCircleOutline size={26} color={colors.primary} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="spinner" />
          </div>
        ) : studios.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              No studios yet. Create your first one!
            </p>
            <button
              className="btn-primary mt-4"
              onClick={() => navigate("/add-studio")}
            >
              Add Studio
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {studios.map((s) => (
              <div
                key={s.id}
                className="cursor-pointer rounded-2xl border overflow-hidden transition hover:shadow-md"
                style={{
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  backgroundColor: isDark ? "#1F2937" : "#fff",
                }}
                onClick={() => navigate(`/manage-studio?id=${s.id}`)}
              >
                {s.studio_media?.[0] ? (
                  <img
                    src={s.studio_media[0].url}
                    alt=""
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-36 items-center justify-center bg-gray-100 dark:bg-gray-700">
                    <span className="text-3xl">🎵</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3
                      className="text-sm font-bold"
                      style={{ color: colors.text }}
                    >
                      {s.name}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(s.id);
                      }}
                      className="rounded-full p-1 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <IoTrashOutline size={16} className="text-red-400" />
                    </button>
                  </div>
                  {/* Permit status badge */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      ["approved", "approved_by_admin", "verified"].includes(String(s.permit_status || "").toLowerCase()) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      s.permit_status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      s.permit_status === "resubmitted" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}>
                      {formatPermitStatus(s.permit_status)}
                    </span>
                  </div>
                  {avgRating(s.reviews) && (
                    <div
                      className="mt-1 flex items-center gap-1 text-xs"
                      style={{ color: colors.textSecondary }}
                    >
                      <IoStar size={12} className="text-yellow-400" />{" "}
                      {avgRating(s.reviews)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmModal
        visible={!!deleteId}
        title="Delete Studio"
        message="Are you sure?"
        buttonText="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
