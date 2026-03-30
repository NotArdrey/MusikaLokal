import { useCallback, useEffect, useState } from "react";
import { IoSparkles } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import GuestSignInGate from "../components/GuestSignInGate";
import Header from "../components/Header";
import ListingCard from "../components/ListingCard";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface Suggestion {
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
  reason?: string;
}

export default function AISuggestionsPage() {
  const { colors, isDark } = useTheme();
  const { session, isGuest } = useAuth();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    try {
      // Fetch AI suggestions via edge function
      const { data, error } = await supabase.functions.invoke(
        "ai-suggestions",
        {
          body: { userId: session.user.id },
        },
      );

      if (!error && data?.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch {
      // Fallback: fetch random listings
      const { data: studios } = await supabase
        .from("studios")
        .select(
          "id, name, description, images, address, hourly_rate, average_rating",
        )
        .limit(8);

      if (studios) {
        setSuggestions(
          studios.map((s) => ({
            id: s.id,
            title: s.name,
            subtitle: s.description?.slice(0, 60),
            type: "Studio",
            images: s.images,
            location: s.address,
            price: s.hourly_rate,
            rating: s.average_rating,
            reason: "Based on your interests",
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  if (isGuest) {
    return (
      <div className="page-container">
        <Header title="AI Suggestions" />
        <GuestSignInGate message="Sign in to get personalized AI suggestions" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <Header title="AI Suggestions" />

      <div className="content-container pb-32">
        {/* Hero banner */}
        <div
          className="mb-8 rounded-2xl p-6 lg:p-8"
          style={{
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <IoSparkles size={24} color="#fff" />
            <h2 className="text-lg font-bold text-white">
              Personalized For You
            </h2>
          </div>
          <p className="text-sm text-white/80">
            AI-powered recommendations based on your profile, preferences, and
            activity.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="spinner"
              style={{ color: colors.primary, width: 32, height: 32 }}
            />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <IoSparkles size={48} color={colors.muted} className="mb-4" />
            <p
              className="text-lg font-semibold mb-1"
              style={{ color: colors.text }}
            >
              No Suggestions Yet
            </p>
            <p
              className="text-sm max-w-sm"
              style={{ color: colors.textSecondary }}
            >
              Complete your profile and browse more to get personalized
              recommendations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {suggestions.map((s) => (
              <div key={s.id}>
                {s.reason && (
                  <p
                    className="mb-2 text-[10px] font-medium"
                    style={{ color: colors.primary }}
                  >
                    ✨ {s.reason}
                  </p>
                )}
                <ListingCard
                  {...s}
                  onPress={() => {
                    const routes: Record<string, string> = {
                      Studio: `/studio/${s.id}`,
                      Gig: `/gig/${s.id}`,
                      Group: `/group/${s.id}`,
                      Artist: `/profile/${s.id}`,
                    };
                    navigate(routes[s.type] || "/home");
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
