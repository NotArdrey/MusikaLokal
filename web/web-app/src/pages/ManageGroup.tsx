import { useEffect, useState } from "react";
import {
    IoChevronBack,
    IoCreateOutline,
    IoLocationOutline,
    IoPeopleOutline,
    IoStar,
    IoTrashOutline,
} from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import ConfirmModal from "../components/Modal";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function ManageGroupPage() {
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const groupId = params.get("id");

  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"about" | "members" | "reviews">("about");
  const [deleteModal, setDeleteModal] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      const [grpRes, memRes, revRes] = await Promise.all([
        supabase
          .from("groups")
          .select("*, group_media(id, url)")
          .eq("id", groupId)
          .single(),
        supabase
          .from("group_members")
          .select("*, profiles(full_name, avatar_url)")
          .eq("group_id", groupId),
        supabase
          .from("reviews")
          .select("*, profiles:reviewer_id(full_name, avatar_url)")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false }),
      ]);
      if (grpRes.data) setGroup(grpRes.data);
      if (memRes.data) setMembers(memRes.data);
      if (revRes.data) setReviews(revRes.data);
      setLoading(false);
    })();
  }, [groupId]);

  const handleDelete = async () => {
    if (!groupId) return;
    await supabase.from("groups").delete().eq("id", groupId);
    navigate("/manage");
  };

  const tabs = ["about", "members", "reviews"] as const;

  if (loading)
    return (
      <div className="page-container">
        <div className="flex justify-center py-20">
          <span className="spinner" />
        </div>
      </div>
    );
  if (!group)
    return (
      <div className="page-container">
        <div
          className="py-20 text-center"
          style={{ color: colors.textSecondary }}
        >
          Group not found
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
            {group.name}
          </h1>
          <button
            onClick={() => navigate(`/edit-group?id=${groupId}`)}
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

        {group.group_media?.[0] && (
          <img
            src={group.group_media[0].url}
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
            {group.group_type && (
              <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                {group.group_type}
              </span>
            )}
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              <IoLocationOutline size={16} />
              {group.location}
            </div>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              <IoPeopleOutline size={16} />
              {members.length} members
            </div>
            {group.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {group.genres.map((g: string) => (
                  <span
                    key={g}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700"
                    style={{ color: colors.textSecondary }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
            {group.description && (
              <p
                className="text-sm leading-relaxed"
                style={{ color: colors.text }}
              >
                {group.description}
              </p>
            )}
          </div>
        )}

        {tab === "members" && (
          <div className="space-y-2">
            {members.length === 0 ? (
              <p
                className="py-10 text-center text-sm"
                style={{ color: colors.textSecondary }}
              >
                No members yet
              </p>
            ) : (
              members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border p-3"
                  style={{
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    backgroundColor: isDark ? "#1F2937" : "#fff",
                  }}
                >
                  <img
                    src={
                      m.profiles?.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(m.profiles?.full_name || "?")}`
                    }
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div
                    className="text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    {m.profiles?.full_name}
                  </div>
                  <span
                    className="ml-auto text-xs capitalize"
                    style={{ color: colors.textSecondary }}
                  >
                    {m.role || "member"}
                  </span>
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
        title="Delete Group"
        message="This action cannot be undone."
        buttonText="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteModal(false)}
      />
    </div>
  );
}
