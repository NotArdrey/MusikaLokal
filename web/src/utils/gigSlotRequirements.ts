export type GigSpecificSlotRequirement = {
  slot_id: string;
  label: string;
  roles: string[];
  preferred_genres: string[];
  preferred_instruments: string[];
};

type SlotDefaults = Pick<
  GigSpecificSlotRequirement,
  "roles" | "preferred_genres" | "preferred_instruments"
>;

const cleanList = (value: unknown): string[] => Array.isArray(value)
  ? Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)))
  : [];

export const normalizeSpecificSlotRequirements = (
  value: unknown,
  count: number,
  slotType: "solo" | "duo",
  defaults: SlotDefaults = { roles: [], preferred_genres: [], preferred_instruments: [] },
): GigSpecificSlotRequirement[] => {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const source = Array.isArray(value) ? value : [];

  return Array.from({ length: safeCount }, (_, index) => {
    const item = source[index] && typeof source[index] === "object"
      ? source[index] as Record<string, unknown>
      : null;
    const number = index + 1;
    const defaultLabel = slotType === "solo" ? `Solo Artist ${number}` : `Duo ${number}`;
    return {
      slot_id: typeof item?.slot_id === "string" && item.slot_id.trim()
        ? item.slot_id.trim()
        : `${slotType}-${number}`,
      label: typeof item?.label === "string" && item.label.trim()
        ? item.label.trim()
        : defaultLabel,
      roles: item ? cleanList(item.roles) : cleanList(defaults.roles),
      preferred_genres: item ? cleanList(item.preferred_genres) : cleanList(defaults.preferred_genres),
      preferred_instruments: item
        ? cleanList(item.preferred_instruments)
        : cleanList(defaults.preferred_instruments),
    };
  });
};

export const aggregateSpecificSlotRequirements = (
  items: GigSpecificSlotRequirement[],
  fallback: SlotDefaults,
): SlotDefaults => ({
  roles: cleanList([...fallback.roles, ...items.flatMap((item) => item.roles)]),
  preferred_genres: cleanList([
    ...fallback.preferred_genres,
    ...items.flatMap((item) => item.preferred_genres),
  ]),
  preferred_instruments: cleanList([
    ...fallback.preferred_instruments,
    ...items.flatMap((item) => item.preferred_instruments),
  ]),
});

const getRequirementList = (value: unknown): string[] => cleanList(value);

export const getSpecificSlotRequirementLines = (slot: unknown): string[] => {
  if (!slot || typeof slot !== "object") return [];
  const source = slot as Record<string, unknown>;
  const items = Array.isArray(source.specific_requirements)
    ? source.specific_requirements
    : [];

  return items.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const requirement = item as Record<string, unknown>;
    const details = [
      ...getRequirementList(requirement.roles),
      ...getRequirementList(requirement.preferred_instruments).map((value) => `Instrument: ${value}`),
      ...getRequirementList(requirement.preferred_genres).map((value) => `Genre: ${value}`),
    ];
    if (details.length === 0) return [];
    const label = typeof requirement.label === "string" && requirement.label.trim()
      ? requirement.label.trim()
      : `Slot ${index + 1}`;
    return [`${label}: ${details.join(", ")}`];
  });
};

export const getSharedSlotRequirements = (slot: unknown): SlotDefaults => {
  if (!slot || typeof slot !== "object") {
    return { roles: [], preferred_genres: [], preferred_instruments: [] };
  }
  const source = slot as Record<string, unknown>;
  const specifics = Array.isArray(source.specific_requirements)
    ? source.specific_requirements.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const removeSpecificValues = (key: keyof SlotDefaults) => {
    const specificValues = new Set(
      specifics.flatMap((item) => getRequirementList(item[key])).map((value) => value.toLowerCase()),
    );
    return getRequirementList(source[key]).filter((value) => !specificValues.has(value.toLowerCase()));
  };

  return {
    roles: removeSpecificValues("roles"),
    preferred_genres: removeSpecificValues("preferred_genres"),
    preferred_instruments: removeSpecificValues("preferred_instruments"),
  };
};

export const getGigSlotCardBadges = (requirements: unknown, limit = 6): string[] => {
  if (!requirements || typeof requirements !== "object") return [];
  const slots = (requirements as Record<string, any>).slots;
  if (!slots || typeof slots !== "object") return [];

  const badges: string[] = [];
  const addCount = (key: "solo" | "duo" | "band", singular: string, plural: string) => {
    const count = Math.max(0, Math.floor(Number(slots[key]?.needed) || 0));
    if (count > 0) badges.push(`${count} ${count === 1 ? singular : plural}`);
  };

  addCount("solo", "Solo artist", "Solo artists");
  addCount("duo", "Duo", "Duos");
  addCount("band", "Group", "Groups");

  const specificLines = [
    ...getSpecificSlotRequirementLines(slots.solo),
    ...getSpecificSlotRequirementLines(slots.duo),
  ];
  const available = Math.max(0, limit - badges.length);
  if (specificLines.length <= available) return [...badges, ...specificLines];
  if (available === 0) return badges.slice(0, limit);

  const visible = specificLines.slice(0, Math.max(0, available - 1));
  const hiddenCount = specificLines.length - visible.length;
  return [...badges, ...visible, `${hiddenCount} more slot requirement${hiddenCount === 1 ? "" : "s"}`];
};
