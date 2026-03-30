import { useCallback, useEffect, useState } from "react";
import {
    IoBusinessOutline,
    IoCalendarOutline,
    IoChatbubbleOutline,
    IoChevronForward,
    IoMusicalNotesOutline,
    IoPeopleOutline,
    IoSearchOutline,
    IoSparkles,
    IoTrendingUp
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import ListingCard from "../components/ListingCard";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface Listing {
  id: string;
  title: string;
  subtitle?: string;
  type: "Studio" | "Gig" | "Group" | "Artist";
  image?: string;
  images?: string[];
  rating?: number;
  location?: string;
  price?: number;
  tags?: string[];
  permitStatus?: string;
}

interface Stats {
  studios: number;
  gigs: number;
  groups: number;
  artists: number;
}

export default function HomePage() {
  const { colors, isDark } = useTheme();
  const { session, isGuest, userRole } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    studios: 0,
    gigs: 0,
    groups: 0,
    artists: 0,
  });
  const [recentStudios, setRecentStudios] = useState<Listing[]>([]);
  const [recentGigs, setRecentGigs] = useState<Listing[]>([]);
  const [recentGroups, setRecentGroups] = useState<Listing[]>([]);
  const [featuredArtists, setFeaturedArtists] = useState<Listing[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<number>(0);

  const userName =
    session?.user?.user_metadata?.full_name?.split(" ")[0] || "there";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const fetchHomeData = useCallback(async () => {
    try {
      // Fetch counts
      const [studiosCount, gigsCount, groupsCount, artistsCount] =
        await Promise.all([
          supabase.from("studios").select("id", { count: "exact", head: true }),
          supabase
            .from("gigs")
            .select("id", { count: "exact", head: true })
            .eq("status", "open"),
          supabase.from("groups").select("id", { count: "exact", head: true }),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "musician"),
        ]);

      setStats({
        studios: studiosCount.count || 0,
        gigs: gigsCount.count || 0,
        groups: groupsCount.count || 0,
        artists: artistsCount.count || 0,
      });

      // Fetch recent items
      const [studios, gigs, groups, artists] = await Promise.all([
        supabase
          .from("studios")
          .select(
            "id, name, description, images, address, hourly_rate, average_rating, permit_status",
          )
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("gigs")
          .select("id, name, description, images, location, budget, event_date, permit_status")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("groups")
          .select("id, name, description, images, genre, location")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("profiles")
          .select("id, full_name, bio, avatar_url, location, rating")
          .eq("role", "musician")
          .order("rating", { ascending: false })
          .limit(4),
      ]);

      setRecentStudios(
        (studios.data || []).map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: s.description?.slice(0, 60),
          type: "Studio" as const,
          images: s.images,
          location: s.address,
          price: s.hourly_rate,
          rating: s.average_rating,
          permitStatus: s.permit_status,
        })),
      );

      setRecentGigs(
        (gigs.data || []).map((g) => ({
          id: g.id,
          title: g.name,
          subtitle: g.description?.slice(0, 60),
          type: "Gig" as const,
          images: g.images,
          location: g.location,
          price: g.budget,
          permitStatus: g.permit_status,
        })),
      );

      setRecentGroups(
        (groups.data || []).map((g) => ({
          id: g.id,
          title: g.name,
          subtitle: g.description?.slice(0, 60),
          type: "Group" as const,
          image: g.images?.[0],
          location: g.location,
          tags: g.genre ? [g.genre] : [],
        })),
      );

      setFeaturedArtists(
        (artists.data || []).map((a) => ({
          id: a.id,
          title: a.full_name || "Musician",
          subtitle: a.bio?.slice(0, 60),
          type: "Artist" as const,
          image: a.avatar_url,
          location: a.location,
          rating: a.rating,
        })),
      );

      // Fetch upcoming bookings count for logged-in user
      if (session?.user?.id) {
        const { count } = await supabase
          .from("studio_bookings")
          .select("id", { count: "exact", head: true })
          .or(
            `user_id.eq.${session.user.id},studio_id.in.(select id from studios where owner_id='${session.user.id}')`,
          )
          .gte("booking_date", new Date().toISOString().split("T")[0])
          .in("status", ["confirmed", "pending"]);
        setUpcomingBookings(count || 0);
      }
    } catch (err) {
      console.error("Error fetching home data:", err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  const quickActions = [
    {
      label: "Discover",
      desc: "Browse all listings",
      icon: IoSearchOutline,
      route: "/discover",
      color: "bg-indigo-500",
    },
    {
      label: "Studios",
      desc: "Find a studio",
      icon: IoBusinessOutline,
      route: "/discover?filter=Studios",
      color: "bg-purple-500",
    },
    {
      label: "Open Gigs",
      desc: "Find performance gigs",
      icon: IoMusicalNotesOutline,
      route: "/discover?filter=Gigs",
      color: "bg-emerald-500",
    },
    {
      label: "Groups",
      desc: "Join a band",
      icon: IoPeopleOutline,
      route: "/discover?filter=Groups",
      color: "bg-blue-500",
    },
  ];

  const statCards = [
    {
      label: "Studios",
      value: stats.studios,
      icon: IoBusinessOutline,
      color: "text-purple-500",
      bg: isDark ? "bg-purple-900/20" : "bg-purple-50",
    },
    {
      label: "Open Gigs",
      value: stats.gigs,
      icon: IoMusicalNotesOutline,
      color: "text-emerald-500",
      bg: isDark ? "bg-emerald-900/20" : "bg-emerald-50",
    },
    {
      label: "Groups",
      value: stats.groups,
      icon: IoPeopleOutline,
      color: "text-blue-500",
      bg: isDark ? "bg-blue-900/20" : "bg-blue-50",
    },
    {
      label: "Artists",
      value: stats.artists,
      icon: IoTrendingUp,
      color: "text-pink-500",
      bg: isDark ? "bg-pink-900/20" : "bg-pink-50",
    },
  ];

  if (loading) {
    return (
      <div className="page-container">
        <Header title="Home" />
        <div className="flex items-center justify-center py-32">
          <div
            className="spinner"
            style={{ color: colors.primary, width: 32, height: 32 }}
          />
        </div>
      </div>
    );
  }

  const SectionHeader = ({
    title,
    route,
  }: {
    title: string;
    route: string;
  }) => (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold" style={{ color: colors.text }}>
        {title}
      </h2>
      <button
        onClick={() => navigate(route)}
        className="flex items-center gap-1 text-sm font-medium transition-colors hover:text-indigo-500"
        style={{ color: colors.primary }}
      >
        View all <IoChevronForward size={14} />
      </button>
    </div>
  );

  return (
    <div className="page-container">
      <Header title="Home" />

      <div className="content-container pt-6 pb-32">
        {/* Greeting Banner */}
        <div
          className="rounded-2xl p-6 lg:p-8 mb-8 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A78BFA 100%)",
          }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 opacity-10">
            <div className="absolute top-4 right-4 w-48 h-48 bg-white rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <p className="text-indigo-200 text-sm font-medium mb-1">
              {getGreeting()},
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
              {isGuest ? "Welcome to MusikaLokal!" : `${userName}! 👋`}
            </h1>
            <p className="text-indigo-200 text-sm max-w-lg">
              {isGuest
                ? "Explore studios, gigs, and connect with local musicians."
                : userRole === "studio-owner"
                  ? "Manage your studios and check today's bookings."
                  : userRole === "venue-owner"
                    ? "Manage your venue and upcoming gig events."
                    : "Discover new gigs, studios, and connect with fellow musicians."}
            </p>

            {/* Quick info badges */}
            {!isGuest && (
              <div className="flex flex-wrap gap-3 mt-4">
                {upcomingBookings > 0 && (
                  <button
                    onClick={() => navigate("/bookings")}
                    className="flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white hover:bg-white/30 transition-colors"
                  >
                    <IoCalendarOutline size={16} />
                    {upcomingBookings} upcoming booking
                    {upcomingBookings > 1 ? "s" : ""}
                  </button>
                )}
                <button
                  onClick={() => navigate("/chat")}
                  className="flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white hover:bg-white/30 transition-colors"
                >
                  <IoChatbubbleOutline size={16} />
                  Messages
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.route)}
              className="group rounded-2xl border p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.color} mb-3`}
              >
                <action.icon size={20} className="text-white" />
              </div>
              <p
                className="text-sm font-semibold"
                style={{ color: colors.text }}
              >
                {action.label}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: colors.textSecondary }}
              >
                {action.desc}
              </p>
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border p-4"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg}`}
                >
                  <stat.icon size={18} className={stat.color} />
                </div>
              </div>
              <p className="text-2xl font-bold" style={{ color: colors.text }}>
                {stat.value.toLocaleString()}
              </p>
              <p
                className="text-xs font-medium"
                style={{ color: colors.textSecondary }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* AI Suggestion CTA */}
        {!isGuest && (
          <button
            onClick={() => navigate("/ai-suggestions")}
            className="w-full rounded-2xl border p-5 mb-8 flex items-center gap-4 text-left transition-all hover:shadow-md group"
            style={{
              backgroundColor: isDark ? "rgba(99,102,241,0.08)" : "#EEF2FF",
              borderColor: isDark ? "rgba(99,102,241,0.2)" : "#C7D2FE",
            }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-transform">
              <IoSparkles size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <p
                className="text-base font-semibold"
                style={{ color: colors.text }}
              >
                AI Suggestions
              </p>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                Get personalized recommendations based on your profile
              </p>
            </div>
            <IoChevronForward size={20} color={colors.textSecondary} />
          </button>
        )}

        {/* Recent Studios */}
        {recentStudios.length > 0 && (
          <div className="mb-8">
            <SectionHeader
              title="Recent Studios"
              route="/discover?filter=Studios"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentStudios.map((listing) => (
                <ListingCard
                  key={listing.id}
                  {...listing}
                  onPress={() => navigate(`/studio/${listing.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Open Gigs */}
        {recentGigs.length > 0 && (
          <div className="mb-8">
            <SectionHeader title="Open Gigs" route="/discover?filter=Gigs" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentGigs.map((listing) => (
                <ListingCard
                  key={listing.id}
                  {...listing}
                  onPress={() => navigate(`/gig/${listing.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Groups */}
        {recentGroups.length > 0 && (
          <div className="mb-8">
            <SectionHeader title="Groups" route="/discover?filter=Groups" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentGroups.map((listing) => (
                <ListingCard
                  key={listing.id}
                  {...listing}
                  onPress={() => navigate(`/group/${listing.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Featured Artists */}
        {featuredArtists.length > 0 && (
          <div className="mb-8">
            <SectionHeader
              title="Top Artists"
              route="/discover?filter=Artists"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featuredArtists.map((listing) => (
                <ListingCard
                  key={listing.id}
                  {...listing}
                  onPress={() => navigate(`/profile/${listing.id}`)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
