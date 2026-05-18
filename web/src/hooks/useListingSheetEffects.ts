import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase";

interface UseListingSheetEffectsParams {
  group: any;
  listingId: string | null;
  bookings: any[];
  selectedTimeSlots: { start: string; end: string }[];
  selectedSessionType: "Rehearsal" | "Recording" | null;
  existingBookings: any[];
  selectedDate: string;
  processAvailability: (
    availability: any,
    existingBookings: any[],
    dateOverrides?: any,
    cartBookings?: any[],
  ) => void;
  fetchAvailableSlots: (dateStr: string) => void;
  setReviews: (value: any[]) => void;
  setRelatedListings: (value: any[]) => void;
}

const getReviewTargetColumn = (type: unknown) => {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "studio" || normalized === "venue") return "studio_id";
  if (normalized === "gig") return "gig_id";
  if (normalized === "artist" || normalized === "musician" || normalized === "profile") return "user_id";
  return "group_id";
};

const normalizeReviewRows = (rows: any[] = []) =>
  rows.map((row) => ({
    ...row,
    author: row?.author ?? row?.profiles ?? null,
    content: row?.content ?? row?.comment ?? null,
    likes_count: Number(row?.likes_count ?? row?.computed_likes_count ?? 0),
  }));

export const useListingSheetEffects = ({
  group,
  listingId,
  bookings,
  selectedTimeSlots,
  selectedSessionType,
  existingBookings,
  selectedDate,
  processAvailability,
  fetchAvailableSlots,
  setReviews,
  setRelatedListings,
}: UseListingSheetEffectsParams) => {
  useEffect(() => {
    if (group?.availability) {
      processAvailability(
        group.availability,
        existingBookings,
        group.dateOverrides,
        bookings,
      );

      if (selectedDate) {
        fetchAvailableSlots(selectedDate);
      }
    }
  }, [bookings.length, selectedTimeSlots.length, selectedSessionType]);

  useEffect(() => {
    const trackView = async () => {
      if (group && group.embedding) {
        try {
          await AsyncStorage.setItem(
            "last_viewed_item",
            JSON.stringify({
              id: listingId,
              embedding: group.embedding,
              type: group.type,
              timestamp: Date.now(),
            }),
          );

          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase.rpc("update_user_interest", {
              p_user_id: user.id,
              p_item_vector: group.embedding,
              p_weight: 0.05,
            });
            console.log("🤖 AI learned from view:", group.name);
          }
        } catch (e) {
          console.log("Error tracking view:", e);
        }
      }
    };

    trackView();
  }, [listingId, group]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!listingId || !group) {
        setReviews([]);
        setRelatedListings([]);
        return;
      }

      try {
        const col = getReviewTargetColumn(group.type);

        const { data: rData, error: reviewsError } = await supabase
          .from("reviews")
          .select("*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url, updated_at)")
          .eq(col, listingId)
          .order("created_at", { ascending: false })
          .limit(5);

        if (reviewsError) {
          console.log("Error reviews:", reviewsError);
          setReviews([]);
        } else {
          setReviews(normalizeReviewRows(rData || []));
        }
      } catch (e) {
        console.log("Error reviews:", e);
        setReviews([]);
      }

      if (group.embedding) {
        try {
          const { data: relatedData } = await supabase.rpc("match_listings", {
            query_embedding: group.embedding,
            match_threshold: 0.5,
            match_count: 5,
            listing_type: group.type,
          });

          if (relatedData && relatedData.length > 0) {
            const relatedIds = relatedData
              .map((r: any) => r.id)
              .filter((id: string) => id !== listingId);

            if (relatedIds.length > 0) {
              let viewName = "groups_with_stats";
              if (group.type === "Studio" || group.type === "Venue") viewName = "studios_with_stats";
              if (group.type === "Gig") viewName = "gigs_with_stats";

              const { data: fullRelated } = await supabase
                .from(viewName)
                .select("*")
                .in("id", relatedIds);

              if (fullRelated) setRelatedListings(fullRelated);
              else setRelatedListings([]);
            } else {
              setRelatedListings([]);
            }
          } else {
            setRelatedListings([]);
          }
        } catch (e) {
          console.log("Error fetching related:", e);
          setRelatedListings([]);
        }
      } else {
        setRelatedListings([]);
      }
    };

    fetchDetails();
  }, [listingId, group, setRelatedListings, setReviews]);
};
