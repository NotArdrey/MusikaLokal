import { useEffect, useState } from "react";
import {
    IoChevronBack,
    IoHeart,
    IoHeartOutline,
    IoLocationOutline,
    IoMusicalNotesOutline,
    IoPeopleOutline,
    IoStar
} from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function GroupDetailsPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const groupId = params.get("id");

  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [tab, setTab] = useState<"about" | "reviews">("about");

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      const [grpRes, memRes, revRes] = await Promise.all([
        supabase.functions.invoke("manage-details", {
          body: { type: "group", id: groupId },
        }),
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
      if (grpRes.data?.group) setGroup(grpRes.data.group);
      else {
        const { data } = await supabase
          .from("groups")
          .select("*, group_media(url)")
          .eq("id", groupId)
          .single();
        if (data) setGroup(data);
      }
      if (memRes.data) setMembers(memRes.data);
      if (revRes.data) setReviews(revRes.data);

      // Check favorite
      if (user) {
        const { data: fav } = await supabase
          .from("favorites")
          .select("id")
          .eq("user_id", user.id)
          .eq("group_id", groupId)
          .maybeSingle();
        if (fav) setIsFavorite(true);
      }
      setLoading(false);
    })();
  }, [groupId, user]);

  const toggleFavorite = async () => {
    if (!user || !groupId) return;
    if (isFavorite) {
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("group_id", groupId);
    } else {
      await supabase
        .from("favorites")
        .insert({ user_id: user.id, group_id: groupId });
    }
    setIsFavorite(!isFavorite);
  };

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

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

  const heroImg = group.group_media?.[0]?.url;

  return (
    <div className="page-container">
      {/* Hero */}
      <div className="relative h-56 w-full">
        {heroImg ? (
          <img src={heroImg} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
            <IoMusicalNotesOutline size={64} className="text-white/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-0 top-0 p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"
          >
            <IoChevronBack size={24} />
          </button>
        </div>
        <div className="absolute right-0 top-0 flex gap-2 p-4">
          <button
            onClick={toggleFavorite}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"
          >
            {isFavorite ? (
              <IoHeart size={22} className="text-red-500" />
            ) : (
              <IoHeartOutline size={22} />
            )}
          </button>
        </div>
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <h1 className="text-2xl font-bold">{group.name}</h1>
          {group.group_type && (
            <span className="mt-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs backdrop-blur-sm">
              {group.group_type}
            </span>
          )}
        </div>
      </div>

      <div className="content-container max-w-3xl pt-6 pb-32">
        {/* Quick stats */}
        <div
          className="mb-4 flex flex-wrap gap-4 text-sm"
          style={{ color: colors.textSecondary }}
        >
          <span className="flex items-center gap-1">
            <IoLocationOutline size={16} />
            {group.location}
          </span>
          <span className="flex items-center gap-1">
            <IoPeopleOutline size={16} />
            {members.length} members
          </span>
          {avgRating && (
            <span className="flex items-center gap-1">
              <IoStar size={16} className="text-yellow-400" />
              {avgRating} ({reviews.length})
            </span>
          )}
        </div>

        {/* Genres */}
        {group.genres?.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1">
            {group.genres.map((g: string) => (
              <span
                key={g}
                className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div
          className="mb-4 flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: isDark ? "#1F2937" : "#F3F4F6" }}
        >
          {(["about", "reviews"] as const).map((t) => (
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
          <div className="space-y-4">
            {group.description && (
              <p
                className="text-sm leading-relaxed"
                style={{ color: colors.text }}
              >
                {group.description}
              </p>
            )}
            <h3
              className="text-sm font-semibold"
              style={{ color: colors.text }}
            >
              Members
            </h3>
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }}
                >
                  <img
                    src={
                      m.profiles?.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(m.profiles?.full_name || "?")}`
                    }
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                  <span className="text-sm" style={{ color: colors.text }}>
                    {m.profiles?.full_name}
                  </span>
                </div>
              ))}
            </div>
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
    </div>
  );
}
