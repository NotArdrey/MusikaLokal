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

export default function MyGroupPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchGroups = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("groups")
      .select("*, group_media(url), reviews:reviews(rating)")
      .eq("leader_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setGroups(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
  }, [user]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("groups").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchGroups();
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
            My Groups
          </h1>
          <button
            onClick={() => navigate("/add-group")}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoAddCircleOutline size={26} color={colors.primary} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="spinner" />
          </div>
        ) : groups.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              No groups yet.
            </p>
            <button
              className="btn-primary mt-4"
              onClick={() => navigate("/add-group")}
            >
              Create Group
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="cursor-pointer rounded-2xl border overflow-hidden transition hover:shadow-md"
                style={{
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  backgroundColor: isDark ? "#1F2937" : "#fff",
                }}
                onClick={() => navigate(`/manage-group?id=${g.id}`)}
              >
                {g.group_media?.[0] ? (
                  <img
                    src={g.group_media[0].url}
                    alt=""
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-36 items-center justify-center bg-gray-100 dark:bg-gray-700">
                    <span className="text-3xl">🎸</span>
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(g.id);
                      }}
                      className="rounded-full p-1 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <IoTrashOutline size={16} className="text-red-400" />
                    </button>
                  </div>
                  {avgRating(g.reviews) && (
                    <div
                      className="mt-1 flex items-center gap-1 text-xs"
                      style={{ color: colors.textSecondary }}
                    >
                      <IoStar size={12} className="text-yellow-400" />{" "}
                      {avgRating(g.reviews)}
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
        title="Delete Group"
        message="Are you sure?"
        buttonText="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
