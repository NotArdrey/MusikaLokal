import { Redirect, useLocalSearchParams } from "expo-router";

export default function AddDuoRoute() {
  const params = useLocalSearchParams();

  const forwardedParams = Object.entries(
    params as Record<string, string | string[] | undefined>,
  ).reduce<Record<string, string>>((acc, [key, value]) => {
    if (key === "mode") return acc;
    const normalized = Array.isArray(value) ? value[0] : value;
    if (typeof normalized === "string" && normalized.trim().length > 0) {
      acc[key] = normalized;
    }
    return acc;
  }, {});

  return <Redirect href={{ pathname: "/add_group", params: { ...forwardedParams, mode: "duo" } }} />;
}
