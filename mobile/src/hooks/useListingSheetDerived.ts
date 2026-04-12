import { useMemo } from "react";
import { normalizeStudioType } from "../components/listingDetails/availability";

const getTypeLabels = (type: string) => {
  switch (type) {
    case "Studio":
      return {
        aboutTitle: "About this studio",
        tabs: ["About", "Setup", "Book", "Review"],
        unit: "hour",
      };
    case "Venue":
      return {
        aboutTitle: "About this venue",
        tabs: ["About", "Specs", "Book", "Review"],
        unit: "hour",
      };
    case "Gig":
      return {
        aboutTitle: "About this gig",
        tabs: ["About", "Apply", "Review"],
        unit: "project",
      };
    case "Artist":
      return {
        aboutTitle: "About this artist",
        tabs: ["About", "Timeline", "Review"],
        unit: "event",
      };
    default:
      return {
        aboutTitle: "About this artist",
        tabs: ["About", "Timeline", "Review"],
        unit: "night",
      };
  }
};

export const useListingSheetDerived = (group: any) => {
  const labels = useMemo(
    () => (group ? getTypeLabels(group.type) : getTypeLabels("Group")),
    [group],
  );

  const isStudioLike = group?.type === "Studio" || group?.type === "Venue";
  const studioMode = normalizeStudioType(group?.studio_type);

  const rehearsalRateNumber = useMemo(() => {
    const parsed = Number(group?.rehearsal_rate ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [group?.rehearsal_rate]);

  const recordingRateNumber = useMemo(() => {
    const parsed = Number(group?.recording_rate ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [group?.recording_rate]);

  const hasRehearsalRate = useMemo(() => {
    if (isStudioLike && studioMode === "Recording") return false;
    return rehearsalRateNumber > 0;
  }, [isStudioLike, rehearsalRateNumber, studioMode]);

  const hasRecordingRate = useMemo(() => {
    if (isStudioLike && studioMode === "Rehearsal") return false;
    return recordingRateNumber > 0;
  }, [isStudioLike, recordingRateNumber, studioMode]);

  const rehearsalRate = useMemo(
    () => (hasRehearsalRate ? rehearsalRateNumber.toLocaleString() : null),
    [hasRehearsalRate, rehearsalRateNumber],
  );

  const recordingRate = useMemo(
    () => (hasRecordingRate ? recordingRateNumber.toLocaleString() : null),
    [hasRecordingRate, recordingRateNumber],
  );

  const hasDualPricing = useMemo(
    () => Boolean(isStudioLike && hasRehearsalRate && hasRecordingRate),
    [hasRecordingRate, hasRehearsalRate, isStudioLike],
  );

  const displayRateNumber = useMemo(() => {
    if (hasRehearsalRate) return rehearsalRateNumber;
    if (hasRecordingRate) return recordingRateNumber;

    const hourly = Number(group?.hourly_rate ?? 0);
    if (Number.isFinite(hourly) && hourly > 0) return hourly;

    const rate = Number(group?.rate ?? 0);
    if (Number.isFinite(rate) && rate > 0) return rate;

    return 0;
  }, [
    group?.hourly_rate,
    group?.rate,
    hasRecordingRate,
    hasRehearsalRate,
    recordingRateNumber,
    rehearsalRateNumber,
  ]);

  const displayRate = useMemo(
    () => displayRateNumber.toLocaleString(),
    [displayRateNumber],
  );

  const showTabs = labels.tabs.length > 0;

  return {
    labels,
    rehearsalRate,
    recordingRate,
    hasDualPricing,
    displayRate,
    showTabs,
  };
};
