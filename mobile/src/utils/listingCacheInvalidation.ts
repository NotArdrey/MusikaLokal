import { queryClient } from "../data/queryClient";
import { queryKeys } from "../data/queryKeys";

type ListingInvalidationScope =
  | "bookings"
  | "details"
  | "feed"
  | "home"
  | "notifications"
  | "search"
  | "wallet";

export const invalidateListingCaches = (
  userId: string | null | undefined,
  scopes: ListingInvalidationScope[],
) => {
  scopes.forEach((scope) => {
    if (scope === "bookings") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.summary(userId) });
      return;
    }

    if (scope === "notifications") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
      return;
    }

    if (scope === "wallet") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary(userId) });
      return;
    }

    void queryClient.invalidateQueries({ queryKey: [scope] });
  });
};
