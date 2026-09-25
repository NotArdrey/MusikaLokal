import { Linking, Platform } from "react-native";

const toCoordinate = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const hasValidCoordinates = (
  latitude?: number | string | null,
  longitude?: number | string | null,
) => {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);
  return lat !== null && lng !== null &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0);
};

type OpenNavigationInput = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  label?: string;
  destinationText?: string | null;
};

export const hasNavigationDestination = ({
  latitude,
  longitude,
  destinationText,
}: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  destinationText?: string | null;
}) => {
  if (hasValidCoordinates(latitude, longitude)) return true;
  return Boolean(destinationText && destinationText.trim().length > 0);
};

export const openNavigationDirections = async ({
  latitude,
  longitude,
  label,
  destinationText,
}: OpenNavigationInput) => {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);
  const normalizedText = destinationText?.trim() || "";
  const hasCoords = hasValidCoordinates(lat, lng);

  if (!hasCoords && !normalizedText) {
    throw new Error("Missing navigation destination");
  }

  const destination = hasCoords ? `${lat},${lng}` : normalizedText;
  const encodedDestination = encodeURIComponent(destination);
  const encodedLabel = encodeURIComponent(label || "Destination");

  const urlsByPriority =
    Platform.OS === "ios"
      ? [
          `comgooglemaps://?daddr=${encodedDestination}&directionsmode=driving`,
          hasCoords
            ? `waze://?ll=${destination}&navigate=yes`
            : `waze://?q=${encodedDestination}&navigate=yes`,
          `maps://?daddr=${encodedDestination}&q=${encodedLabel}`,
        ]
      : Platform.OS === "android"
        ? [
            `google.navigation:q=${encodedDestination}`,
            hasCoords
              ? `waze://?ll=${destination}&navigate=yes`
              : `waze://?q=${encodedDestination}&navigate=yes`,
            hasCoords
              ? `geo:${destination}?q=${destination}(${encodedLabel})`
              : `geo:0,0?q=${encodedDestination}`,
          ]
        : [];

  for (const url of urlsByPriority) {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return;
    }
  }

  await Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}`,
  );
};
