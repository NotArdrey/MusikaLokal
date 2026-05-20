import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useListingDetailsQuery } from "../data/hooks";

interface UseListingSheetEffectsParams {
  group: any;
  listingId: string | null;
  userId?: string | null;
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

const getReviewContent = (row: any) => {
  const candidates = [row?.content, row?.comment, row?.feedback, row?.body, row?.review_text];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
};

const normalizeReviewRows = (rows: any[] = []) =>
  rows.map((row) => ({
    ...row,
    author: row?.author ?? row?.profiles ?? null,
    content: getReviewContent(row),
    likes_count: Number(row?.likes_count ?? row?.computed_likes_count ?? 0),
  }));

export const useListingSheetEffects = ({
  group,
  listingId,
  userId,
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
  const listingDetailsType = group?.type
    ? String(group.type).trim().toLowerCase()
    : null;
  const groupType = group?.type;
  const listingDetailsQuery = useListingDetailsQuery({
    enabled: Boolean(listingId && listingDetailsType),
    id: listingId,
    type: listingDetailsType,
    userId,
  });

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
          }
        } catch {
        }
      }
    };

    trackView();
  }, [listingId, group]);

  useEffect(() => {
    if (!listingId || !group) {
      setReviews([]);
      setRelatedListings([]);
      return;
    }

    if (!listingDetailsQuery.data) return;

    const payload = listingDetailsQuery.data as any;
    const reviews = normalizeReviewRows(
      Array.isArray(payload?.reviews) ? payload.reviews : [],
    );

    if (reviews.length > 0) {
      setReviews(reviews);
    }
    setRelatedListings(
      Array.isArray(payload?.related_listings) ? payload.related_listings : [],
    );
  }, [group, listingDetailsQuery.data, listingId, setRelatedListings, setReviews]);

  useEffect(() => {
    let active = true;

    if (!listingId || !group) {
      setReviews([]);
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        const col = getReviewTargetColumn(groupType);
        const { data, error } = await supabase
          .from("reviews")
          .select("*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url, updated_at)")
          .eq(col, listingId)
          .order("created_at", { ascending: false })
          .limit(5);

        if (!active) return;

        if (error) {
          setReviews([]);
          return;
        }

        setReviews(normalizeReviewRows(data || []));
      } catch {
        if (active) {
          setReviews([]);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [group, groupType, listingId, setReviews]);
};
