// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const DEFAULT_PAGE_SIZE = 20;
const PROFILE_SKILL_DISPLAY_EXCLUSIONS = new Set(["producer"]);

const isVisibleProfileSkill = (value: unknown) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !PROFILE_SKILL_DISPLAY_EXCLUSIONS.has(value.trim().toLowerCase());

type SearchTable =
  | "groups_with_stats"
  | "profiles"
  | "studios_with_stats"
  | "gigs_with_stats"
  | "production_teams";

const collectProfileValues = (rows: any[] | null | undefined, valueKey: string) => {
  const valueMap = new Map<string, string[]>();

  (rows || []).forEach((row: any) => {
    const profileId = row?.profile_id;
    const rawValue = row?.[valueKey];
    if (typeof profileId !== "string" || typeof rawValue !== "string") return;

    const nextValue = rawValue.trim();
    if (!nextValue || (valueKey === "skill" && !isVisibleProfileSkill(nextValue))) return;

    const existingValues = valueMap.get(profileId);
    if (existingValues) {
      existingValues.push(nextValue);
      return;
    }

    valueMap.set(profileId, [nextValue]);
  });

  return valueMap;
};

const parsePageCursor = (cursor: unknown) => {
  const parsed = Number(cursor || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const getTables = (params: any): SearchTable[] => {
  const activeFilter = String(params.activeFilter || params.type || "All");

  if (params.isGuest) {
    return ["groups_with_stats", "profiles"];
  }

  if (params.isOwner) {
    if (activeFilter === "All") return ["groups_with_stats", "profiles", "production_teams"];
    if (activeFilter === "Musician") return ["groups_with_stats", "profiles"];
    if (activeFilter === "Production Team") return ["production_teams"];
    return [];
  }

  if (activeFilter === "All") {
    return [
      "groups_with_stats",
      "profiles",
      "studios_with_stats",
      "gigs_with_stats",
      "production_teams",
    ];
  }

  if (activeFilter === "Musician" || activeFilter === "Music Group" || activeFilter === "Solo Artist") {
    return ["groups_with_stats", "profiles"];
  }
  if (activeFilter === "Studio" || activeFilter === "Venue") return ["studios_with_stats"];
  if (activeFilter === "Gig") return ["gigs_with_stats"];
  if (activeFilter === "Production Team") return ["production_teams"];

  return ["groups_with_stats", "profiles", "studios_with_stats", "gigs_with_stats"];
};

const getResultType = (table: SearchTable) => {
  if (table === "groups_with_stats") return "Group";
  if (table === "studios_with_stats") return "Studio";
  if (table === "profiles") return "Artist";
  if (table === "production_teams") return "Production";
  return "Gig";
};

const getResultTimestamp = (item: any) => {
  const raw = item?.created_at || item?.updated_at;
  const timestamp = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeResult = (
  table: SearchTable,
  item: any,
  helpers: {
    ownerAvatarById: Map<string, string>;
    profileGenresById: Map<string, string[]>;
    profileSkillsById: Map<string, string[]>;
    profileStatsById: Map<string, { rating: number; review_count: number; completion_rate: number | null }>;
  },
) => {
  const type = getResultType(table);
  const ownerId = item.owner_id || item.organizer_id;
  const profileGenres = helpers.profileGenresById.get(item.id) || [];
  const profileSkills = helpers.profileSkillsById.get(item.id) || [];
  const profileStats = helpers.profileStatsById.get(item.id);

  return {
    ...item,
    type,
    social_follow_target_id:
      table === "groups_with_stats" || table === "profiles"
        ? item.id
        : typeof ownerId === "string" && ownerId.length > 0
          ? ownerId
          : null,
    social_follow_target_type: table === "groups_with_stats" ? "group" : "profile",
    studio_type: type === "Studio" ? item.type || item.studio_type || null : item.studio_type || null,
    genres: table === "profiles" ? profileGenres : item.genres,
    skills: table === "profiles" ? profileSkills : item.skills,
    rating: table === "profiles" ? profileStats?.rating || 0 : Number(item.rating || 0),
    review_count:
      table === "profiles" ? profileStats?.review_count || 0 : Number(item.review_count || 0),
    completion_rate:
      table === "profiles" ? profileStats?.completion_rate ?? null : item.completion_rate,
    name: item.name || item.full_name || item.title,
    location: item.location || item.address || item.description,
    image: item.images?.[0] || item.image || item.avatar_url || item.logo_url || item.cover_image_url,
    owner_avatar_url: helpers.ownerAvatarById.get(ownerId) || null,
    genre:
      item.genre ||
      (table === "profiles"
        ? profileGenres.join(", ")
        : Array.isArray(item.genres)
          ? item.genres.join(", ")
          : ""),
    rate: (item.rate || item.hourly_rate || item.budget || item.budget_range)?.toString(),
    show_gig_statuses: item.show_gig_statuses,
    open_production_applications: item.open_production_applications,
  };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const params = await req.json();
    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );

    const pageSize = Math.max(1, Math.min(Number(params.limit) || DEFAULT_PAGE_SIZE, 50));
    const page = parsePageCursor(params.cursor);
    const queryText = String(params.query || params.searchQuery || "").trim();
    const selectedGenre = String(params.selectedGenre || params.genre || "All");
    const sortBy = String(params.sortBy || "newest");
    const priceRange = String(params.priceRange || "all");
    const minRating = Number(params.minRating || 0);
    const tables = getTables(params);
    const fetchedCountsByTable = new Map<string, number>();
    let results: any[] = [];

    for (const table of tables) {
      let query = supabaseClient.from(table).select("*");

      if (table === "profiles") {
        query = query
          .select("id, full_name, avatar_url, address, created_at, role, show_gig_statuses")
          .eq("role", "musician")
          .eq("is_verified", true)
          .eq("verification_status", "APPROVED");
      }

      if (queryText.length > 0) {
        const safeQuery = queryText.replace(/[%(),]/g, " ");
        if (table === "profiles") {
          query = query.or(`full_name.ilike.%${safeQuery}%,address.ilike.%${safeQuery}%`);
        } else if (table === "production_teams") {
          query = query.or(`name.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`);
        } else {
          query = query.or(`name.ilike.%${safeQuery}%,location.ilike.%${safeQuery}%`);
        }
      }

      if (table === "gigs_with_stats") {
        query = query.eq("status", "open").eq("permit_status", "approved");
      }

      if (table === "studios_with_stats") {
        query = query.eq("permit_status", "approved");
      }

      if (selectedGenre !== "All" && (table === "groups_with_stats" || table === "gigs_with_stats")) {
        query = query.ilike("genre", `%${selectedGenre}%`);
      }

      if (minRating > 0 && table !== "profiles" && table !== "production_teams") {
        query = query.gte("rating", minRating);
      }

      if (priceRange !== "all" && table !== "profiles" && table !== "production_teams") {
        const priceField = table.includes("studio") ? "hourly_rate" : table.includes("gig") ? "budget" : "rate";
        if (priceRange === "low") query = query.lte(priceField, 5000);
        if (priceRange === "mid") query = query.gte(priceField, 5000).lte(priceField, 15000);
        if (priceRange === "high") query = query.gte(priceField, 15000);
      }

      if (sortBy === "rating" && table !== "profiles" && table !== "production_teams") {
        query = query.order("rating", { ascending: false });
      } else if (sortBy === "price_low" && table !== "profiles" && table !== "production_teams") {
        const priceField = table.includes("studio") ? "hourly_rate" : table.includes("gig") ? "budget" : "rate";
        query = query.order(priceField, { ascending: true, nullsFirst: false });
      } else if (sortBy === "price_high" && table !== "profiles" && table !== "production_teams") {
        const priceField = table.includes("studio") ? "hourly_rate" : table.includes("gig") ? "budget" : "rate";
        query = query.order(priceField, { ascending: false, nullsFirst: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data: tableRows, error } = await query.range(from, to);
      if (error) throw error;

      fetchedCountsByTable.set(table, tableRows?.length || 0);

      if (!tableRows || tableRows.length === 0) {
        continue;
      }

      let profileGenresById = new Map<string, string[]>();
      let profileSkillsById = new Map<string, string[]>();
      let profileStatsById = new Map<string, { rating: number; review_count: number; completion_rate: number | null }>();
      const ownerAvatarById = new Map<string, string>();

      if (table === "profiles") {
        const profileIds = tableRows.map((item: any) => item?.id).filter(Boolean);
        if (profileIds.length > 0) {
          const [{ data: genreRows }, { data: skillRows }, { data: statRows }] = await Promise.all([
            supabaseClient.from("profile_genres").select("profile_id, genre").in("profile_id", profileIds),
            supabaseClient.from("profile_skills").select("profile_id, skill").in("profile_id", profileIds),
            supabaseClient
              .from("profiles_with_stats")
              .select("id, rating, review_count, completion_rate")
              .in("id", profileIds),
          ]);

          profileGenresById = collectProfileValues(genreRows, "genre");
          profileSkillsById = collectProfileValues(skillRows, "skill");
          profileStatsById = new Map(
            (statRows || []).map((row: any) => [
              row.id,
              {
                completion_rate:
                  row?.completion_rate !== null &&
                  row?.completion_rate !== undefined &&
                  Number.isFinite(Number(row.completion_rate))
                    ? Number(row.completion_rate)
                    : null,
                rating: Number(row?.rating || 0),
                review_count: Number(row?.review_count || 0),
              },
            ]),
          );
        }
      }

      const ownerIds = Array.from(
        new Set(tableRows.map((item: any) => item?.owner_id || item?.organizer_id).filter(Boolean)),
      );

      if (ownerIds.length > 0) {
        const { data: ownerRows } = await supabaseClient
          .from("profiles")
          .select("id, avatar_url")
          .in("id", ownerIds);

        (ownerRows || []).forEach((row: any) => {
          if (row?.id && row?.avatar_url) ownerAvatarById.set(row.id, row.avatar_url);
        });
      }

      const helpers = {
        ownerAvatarById,
        profileGenresById,
        profileSkillsById,
        profileStatsById,
      };

      results.push(...tableRows.map((item: any) => normalizeResult(table, item, helpers)));
    }

    const groupIds = results.filter((item) => item.type === "Group" && item.id).map((item) => item.id);
    if (groupIds.length > 0) {
      const { data: groupVisibilityRows } = await supabaseClient
        .from("groups")
        .select("id, open_group_applications")
        .in("id", Array.from(new Set(groupIds)));

      const visibilityMap = new Map<string, boolean>();
      (groupVisibilityRows || []).forEach((row: any) => {
        visibilityMap.set(row.id, row.open_group_applications === true);
      });

      results = results.map((item) =>
        item.type === "Group"
          ? { ...item, open_group_applications: visibilityMap.get(item.id) ?? item.open_group_applications === true }
          : item,
      );
    }

    const studioIds = results.filter((item) => item.type === "Studio" && item.id).map((item) => item.id);
    if (studioIds.length > 0) {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: studioPromos } = await supabaseClient
        .from("studio_promotions")
        .select("studio_id")
        .in("studio_id", Array.from(new Set(studioIds)))
        .eq("is_active", true)
        .or(`is_permanent.eq.true,and(start_date.lte.${todayStr},end_date.gte.${todayStr})`);

      const promoStudioIds = new Set((studioPromos || []).map((p: any) => p.studio_id));
      results = results.map((item) =>
        item.type === "Studio" ? { ...item, has_active_promotion: promoStudioIds.has(item.id) } : item,
      );
    }

    if (sortBy === "rating") {
      results.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    } else if (sortBy === "price_low") {
      results.sort((a, b) => Number.parseFloat(a.rate || "0") - Number.parseFloat(b.rate || "0"));
    } else if (sortBy === "price_high") {
      results.sort((a, b) => Number.parseFloat(b.rate || "0") - Number.parseFloat(a.rate || "0"));
    } else {
      results.sort((a, b) => {
        const timestampDelta = getResultTimestamp(b) - getResultTimestamp(a);
        if (timestampDelta !== 0) return timestampDelta;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
    }

    if (selectedGenre !== "All") {
      results = results.filter((item) =>
        item.type === "Artist"
          ? String(item.genre || "").toLowerCase().includes(selectedGenre.toLowerCase())
          : true,
      );
    }

    if (minRating > 0) {
      results = results.filter((item) => Number(item.rating || 0) >= minRating);
    }

    const items = results.slice(0, pageSize);
    const hasNextPage = tables.some((table) => (fetchedCountsByTable.get(table) || 0) === pageSize);
    const nextCursor = hasNextPage ? String(page + 1) : null;

    return new Response(
      JSON.stringify({
        items,
        data: items,
        nextCursor,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
