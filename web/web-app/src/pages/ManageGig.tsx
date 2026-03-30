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
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function ManageGigPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const gigId = params.get("id");

  const [gig, setGig] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"about" | "applications" | "reviews">("about");
  const [deleteModal, setDeleteModal] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!gigId) return;
    (async () => {
      const [gigRes, appsRes, revRes] = await Promise.all([
        supabase
          .from("gigs")
          .select("*, gig_media(id, url)")
          .eq("id", gigId)
          .single(),
        supabase
          .from("gig_applications")
          .select("*, profiles(full_name, avatar_url)")
          .eq("gig_id", gigId)
          .order("created_at", { ascending: false }),
        supabase
          .from("reviews")
          .select("*, profiles:reviewer_id(full_name, avatar_url)")
          .eq("gig_id", gigId)
          .order("created_at", { ascending: false }),
      ]);
      if (gigRes.data) setGig(gigRes.data);
      if (appsRes.data) setApplications(appsRes.data);
      if (revRes.data) setReviews(revRes.data);
      setLoading(false);
    })();
  }, [gigId]);

  const handleApplicationAction = async (
    appId: string,
    action: "accepted" | "rejected",
  ) => {
    await supabase
      .from("gig_applications")
      .update({ status: action })
      .eq("id", appId);
    setApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: action } : a)),
    );
  };

  const handleDelete = async () => {
    if (!gigId) return;
    await supabase.from("gigs").delete().eq("id", gigId);
    navigate("/manage");
  };

  const tabs = ["about", "applications", "reviews"] as const;

  if (loading)
    return (
      <div className="page-container">
        <div className="flex justify-center py-20">
          <span className="spinner" />
        </div>
      </div>
    );
  if (!gig)
    return (
      <div className="page-container">
        <div
          className="py-20 text-center"
          style={{ color: colors.textSecondary }}
        >
          Gig not found
        </div>
      </div>
    );

  return (
    <div className="page-container">
      <div className="content-container max-w-3xl pt-6 pb-32">
        {/* Header */}
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
            {gig.name}
          </h1>
          <button
            onClick={() => navigate(`/edit-gig?id=${gigId}`)}
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

        {/* Hero image */}
        {gig.gig_media?.[0] && (
          <img
            src={gig.gig_media[0].url}
            alt=""
            className="mb-4 h-48 w-full rounded-2xl object-cover"
          />
        )}

        {/* Tabs */}
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
                gig.permit_status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                gig.permit_status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                gig.permit_status === "resubmitted" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
              }`}>
                {(gig.permit_status || "pending_review").replace("_", " ")}
              </span>
              {gig.permit_status === "rejected" && gig.permit_rejection_reason && (
                <span className="text-xs text-red-500 ml-2">
                  ({gig.permit_rejection_reason})
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              <IoLocationOutline size={16} /> {gig.location}
            </div>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              <IoCalendarOutline size={16} /> {gig.event_date}
              {gig.start_time && ` · ${gig.start_time}`}
              {gig.end_time && ` - ${gig.end_time}`}
            </div>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              <IoCashOutline size={16} /> ₱{gig.budget?.toLocaleString()}
            </div>
            {gig.description && (
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: colors.text }}
              >
                {gig.description}
              </p>
            )}
            {gig.requirements && (
              <div className="mt-2">
                <h3
                  className="text-xs font-semibold"
                  style={{ color: colors.textSecondary }}
                >
                  Requirements
                </h3>
                <p className="text-sm" style={{ color: colors.text }}>
                  {gig.requirements}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "applications" && (
          <div className="space-y-3">
            {applications.length === 0 ? (
              <p
                className="py-10 text-center text-sm"
                style={{ color: colors.textSecondary }}
              >
                No applications yet
              </p>
            ) : (
              applications.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center gap-3 rounded-xl border p-4"
                  style={{
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    backgroundColor: isDark ? "#1F2937" : "#fff",
                  }}
                >
                  <img
                    src={
                      app.profiles?.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(app.profiles?.full_name || "?")}`
                    }
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div className="flex-1">
                    <div
                      className="text-sm font-medium"
                      style={{ color: colors.text }}
                    >
                      {app.profiles?.full_name}
                    </div>
                    <div
                      className="text-xs capitalize"
                      style={{ color: colors.textSecondary }}
                    >
                      {app.status}
                    </div>
                  </div>
                  {app.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleApplicationAction(app.id, "accepted")
                        }
                        className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() =>
                          handleApplicationAction(app.id, "rejected")
                        }
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Reject
                      </button>
                    </div>
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
        title="Delete Gig"
        message="This action cannot be undone."
        buttonText="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteModal(false)}
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
