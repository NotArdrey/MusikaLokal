import { useCallback, useEffect, useMemo, useState } from "react";
import { IoRefresh, IoSearch, IoSparkles } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import ListingCard from "../components/ListingCard";
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

export default function DiscoverPage() {
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("All");

  const filters = ["All", "Studios", "Gigs", "Groups", "Artists"];

  const fetchListings = useCallback(async () => {
    try {
      const { data: studios } = await supabase
        .from("studios")
        .select(
          "id, name, description, images, address, hourly_rate, average_rating, permit_status",
        )
        .limit(20);

      const { data: gigs } = await supabase
        .from("gigs")
        .select("id, name, description, images, location, budget, event_date, permit_status")
        .eq("status", "open")
        .limit(20);

      const { data: groups } = await supabase
        .from("groups")
        .select("id, name, description, images, genre, location")
        .limit(20);

      const { data: artists } = await supabase
        .from("profiles")
        .select("id, full_name, bio, avatar_url, location")
        .eq("role", "musician")
        .limit(20);

      const allListings: Listing[] = [
        ...(studios || []).map((s) => ({
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
        ...(gigs || []).map((g) => ({
          id: g.id,
          title: g.name,
          subtitle: g.description?.slice(0, 60),
          type: "Gig" as const,
          images: g.images,
          location: g.location,
          price: g.budget,
          permitStatus: g.permit_status,
        })),
        ...(groups || []).map((g) => ({
          id: g.id,
          title: g.name,
          subtitle: g.description?.slice(0, 60),
          type: "Group" as const,
          image: g.images?.[0],
          location: g.location,
          tags: g.genre ? [g.genre] : [],
        })),
        ...(artists || []).map((a) => ({
          id: a.id,
          title: a.full_name || "Musician",
          subtitle: a.bio?.slice(0, 60),
          type: "Artist" as const,
          image: a.avatar_url,
          location: a.location,
          tags: [],
        })),
      ];

      const shuffled = allListings.sort(() => Math.random() - 0.5);
      setListings(shuffled);
    } catch (err) {
      console.error("Error fetching listings:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    const channel = supabase
      .channel("discover-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studios" },
        () => fetchListings(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gigs" },
        () => fetchListings(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchListings]);

  const filteredListings = useMemo(() => {
    let filtered = listings;

    if (activeFilter !== "All") {
      const typeMap: Record<string, string> = {
        Studios: "Studio",
        Gigs: "Gig",
        Groups: "Group",
        Artists: "Artist",
      };
      filtered = filtered.filter((l) => l.type === typeMap[activeFilter]);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.subtitle?.toLowerCase().includes(q) ||
          l.location?.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [listings, activeFilter, searchQuery]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchListings();
  };

  return (
    <div className="page-container">
      <Header title="Discover" />

      <div className="content-container pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div
            className="flex flex-1 max-w-lg items-center gap-3 rounded-2xl border px-4 py-3 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
            style={{
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
            }}
          >
            <IoSearch size={18} color={colors.textSecondary} />
            <input
              type="text"
              placeholder="Search studios, gigs, artists..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: colors.text }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseAI(!useAI)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                useAI
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : isDark
                    ? "bg-slate-800 text-slate-300 border border-slate-700"
                    : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
            >
              <IoSparkles size={16} />
              {useAI ? "AI On" : "AI Off"}
            </button>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-xl p-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
              style={{ backgroundColor: isDark ? colors.surface : "#F3F4F6" }}
            >
              <IoRefresh
                size={18}
                color={colors.textSecondary}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-none">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`whitespace-nowrap rounded-full px-6 py-2.5 text-sm font-semibold transition-all ${
                activeFilter === filter
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : isDark
                    ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="spinner"
              style={{ color: colors.primary, width: 32, height: 32 }}
            />
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <IoSearch size={48} color={colors.muted} className="mb-4" />
            <p
              className="text-lg font-semibold mb-1"
              style={{ color: colors.text }}
            >
              No Results Found
            </p>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Try a different search or filter
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-32">
            {filteredListings.map((listing) => (
              <ListingCard
                key={`${listing.type}-${listing.id}`}
                {...listing}
                onPress={() => {
                  const routes: Record<string, string> = {
                    Studio: `/studio/${listing.id}`,
                    Gig: `/gig/${listing.id}`,
                    Group: `/group/${listing.id}`,
                    Artist: `/profile/${listing.id}`,
                  };
                  navigate(routes[listing.type] || "/home");
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
