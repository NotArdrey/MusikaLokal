import { useMemo } from "react";

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

  const rehearsalRate = useMemo(
    () => (group?.rehearsal_rate ? parseInt(group.rehearsal_rate).toLocaleString() : null),
    [group],
  );

  const recordingRate = useMemo(
    () => (group?.recording_rate ? parseInt(group.recording_rate).toLocaleString() : null),
    [group],
  );

  const hasDualPricing = useMemo(
    () => Boolean(
      group?.type === "Studio" &&
        rehearsalRate &&
        recordingRate &&
        rehearsalRate !== "0" &&
        recordingRate !== "0",
    ),
    [group, rehearsalRate, recordingRate],
  );

  const displayRate = useMemo(
    () =>
      group?.rate
        ? parseInt(group.rate).toLocaleString()
        : rehearsalRate || recordingRate || group?.hourly_rate
          ? parseInt(group?.hourly_rate || "0").toLocaleString()
          : "0",
    [group, rehearsalRate, recordingRate],
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
