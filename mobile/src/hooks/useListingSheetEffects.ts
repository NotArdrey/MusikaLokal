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
        } catch (e) {
        }
      }
    };

    trackView();
  }, [listingId, group]);

  useEffect(() => {
    if (!listingId || !group || !listingDetailsQuery.data) return;

    const payload = listingDetailsQuery.data as any;
    const reviews = (payload?.reviews || []).map((row: any) => ({
      ...row,
      content: row?.content ?? row?.comment ?? null,
    }));

    setReviews(reviews);
    setRelatedListings(
      Array.isArray(payload?.related_listings) ? payload.related_listings : [],
    );
  }, [group, listingDetailsQuery.data, listingId, setRelatedListings, setReviews]);
};
