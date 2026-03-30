import { useCallback, useEffect, useState } from "react";
import {
    IoCalendarOutline,
    IoCamera,
    IoLocationOutline,
    IoMusicalNotesOutline,
    IoSettingsOutline,
    IoStarOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import GuestSignInGate from "../components/GuestSignInGate";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface ProfileData {
  id: string;
  full_name: string;
  email: string;
  bio: string | null;
  avatar_url: string | null;
  role: string;
  location: string | null;
  skills: string[];
  genres: string[];
  is_verified: boolean;
  experience_years: number | null;
  portfolio_urls: string[];
  rating: number | null;
  review_count: number;
}

export default function ProfilePage() {
  const { colors, isDark } = useTheme();
  const { session, isGuest, userRole } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"about" | "portfolio" | "reviews">(
    "about",
  );

  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!error && data) {
        setProfile(data as ProfileData);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (isGuest) {
    return (
      <div className="page-container">
        <Header title="Profile" />
        <GuestSignInGate message="Sign in to view your profile" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <Header title="Profile" />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="spinner"
            style={{ color: colors.primary, width: 32, height: 32 }}
          />
        </div>
      ) : (
        <div className="content-container pb-32">
          {/* Profile Header Card */}
          <div className="card relative mb-6 overflow-hidden">
            {/* Banner gradient */}
            <div
              className="absolute inset-x-0 top-0 h-32"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
              }}
            />

            <div className="relative pt-16 pb-4 px-6">
              {/* Avatar */}
              <div className="relative mb-4 inline-block">
                <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-white shadow-lg dark:border-slate-800">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-3xl font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
                      }}
                    >
                      {profile?.full_name?.charAt(0) || "?"}
                    </div>
                  )}
                </div>
                {profile?.is_verified && (
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white text-xs">
                    ✓
                  </span>
                )}
              </div>

              {/* Name & Role */}
              <h2 className="text-2xl font-bold" style={{ color: colors.text }}>
                {profile?.full_name || "User"}
              </h2>
              <p
                className="text-base capitalize"
                style={{ color: colors.textSecondary }}
              >
                {profile?.role?.replace("-", " ") || "Musician"}
              </p>

              {/* Quick stats */}
              <div className="mt-4 flex gap-6">
                {profile?.location && (
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    <IoLocationOutline size={16} />
                    {profile.location}
                  </div>
                )}
                {profile?.experience_years && (
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    <IoCalendarOutline size={16} />
                    {profile.experience_years} yrs exp.
                  </div>
                )}
                {profile?.rating && (
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    <IoStarOutline size={16} />
                    {profile.rating.toFixed(1)} ({profile.review_count})
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-5 flex gap-3">
                <button
                  className="btn-primary text-sm"
                  onClick={() => navigate("/edit-profile")}
                >
                  Edit Profile
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => navigate("/settings")}
                >
                  <IoSettingsOutline size={16} className="mr-1" />
                  Settings
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div
            className="mb-6 flex border-b"
            style={{ borderColor: colors.border }}
          >
            {(["about", "portfolio", "reviews"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-base font-medium capitalize transition-all border-b-2 ${
                  activeTab === tab
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent hover:text-gray-700 dark:hover:text-slate-300"
                }`}
                style={{
                  color:
                    activeTab === tab ? colors.primary : colors.textSecondary,
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "about" && (
            <div className="space-y-6 animate-fade-in">
              {/* Bio */}
              {profile?.bio && (
                <div className="card">
                  <h3
                    className="mb-2 text-base font-semibold"
                    style={{ color: colors.text }}
                  >
                    About
                  </h3>
                  <p
                    className="text-base leading-relaxed"
                    style={{ color: colors.textSecondary }}
                  >
                    {profile.bio}
                  </p>
                </div>
              )}

              {/* Skills */}
              {profile?.skills && profile.skills.length > 0 && (
                <div className="card">
                  <h3
                    className="mb-3 flex items-center gap-2 text-base font-semibold"
                    style={{ color: colors.text }}
                  >
                    <IoMusicalNotesOutline size={18} />
                    Skills & Instruments
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full px-4 py-2 text-sm font-medium"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(99,102,241,0.15)"
                            : "#EEF2FF",
                          color: colors.primary,
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Genres */}
              {profile?.genres && profile.genres.length > 0 && (
                <div className="card">
                  <h3
                    className="mb-3 text-base font-semibold"
                    style={{ color: colors.text }}
                  >
                    Genres
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.genres.map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full px-4 py-2 text-sm font-medium"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.08)"
                            : "#F3F4F6",
                          color: colors.textSecondary,
                        }}
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "portfolio" && (
            <div className="animate-fade-in">
              {profile?.portfolio_urls && profile.portfolio_urls.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {profile.portfolio_urls.map((url, i) => (
                    <div
                      key={i}
                      className="aspect-square overflow-hidden rounded-xl"
                    >
                      <img
                        src={url}
                        alt={`Portfolio ${i + 1}`}
                        className="h-full w-full object-cover transition-transform hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <IoCamera size={40} color={colors.muted} className="mb-3" />
                  <p
                    className="text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    No portfolio items yet
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "reviews" && (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
              <IoStarOutline size={40} color={colors.muted} className="mb-3" />
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                No reviews yet
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
