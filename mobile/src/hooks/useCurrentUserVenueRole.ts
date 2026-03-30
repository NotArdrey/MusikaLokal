import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export const useCurrentUserVenueRole = () => {
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasExistingVenue, setHasExistingVenue] = useState(false);
  const [checkingVenue, setCheckingVenue] = useState(false);

  const checkForExistingVenue = async (userId: string) => {
    setCheckingVenue(true);
    try {
      const { data, error } = await supabase
        .from("gigs")
        .select("id")
        .eq("organizer_id", userId)
        .limit(1);

      if (!error && data && data.length > 0) {
        setHasExistingVenue(true);
      } else {
        setHasExistingVenue(false);
      }
    } catch (e) {
      console.log("Error checking venue:", e);
      setHasExistingVenue(false);
    } finally {
      setCheckingVenue(false);
    }
  };

  useEffect(() => {
    const fetchUserRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (data) {
          setCurrentUserRole(data.role);
          if (data.role === "venue-owner") {
            checkForExistingVenue(user.id);
          }
        }
      }
    };

    fetchUserRole();
  }, []);

  return {
    currentUserRole,
    currentUserId,
    hasExistingVenue,
    checkingVenue,
  };
};
