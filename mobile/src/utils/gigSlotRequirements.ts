import { PH_MUSIC_GROUP_TYPES } from "../constants/groupTypes";

export type GigSpecificSlotMemberRequirement = {
  label: string;
  roles: string[];
  preferred_instruments: string[];
};

export type GigSpecificSlotRequirement = {
  slot_id: string;
  label: string;
  group_type?: string;
  roles: string[];
  preferred_genres: string[];
  preferred_instruments: string[];
  members?: GigSpecificSlotMemberRequirement[];
};

type SlotDefaults = Pick<
  GigSpecificSlotRequirement,
  "roles" | "preferred_genres" | "preferred_instruments"
>;

type SpecificSlotDefaults = Partial<SlotDefaults> & { group_types?: string[] };

const cleanList = (value: unknown): string[] => Array.isArray(value)
  ? Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)))
  : [];

export const normalizeSpecificSlotRequirements = (
  value: unknown,
  count: number,
  slotType: "solo" | "duo" | "band",
  defaults: SpecificSlotDefaults = {},
): GigSpecificSlotRequirement[] => {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const source = Array.isArray(value) ? value : [];

  return Array.from({ length: safeCount }, (_, index) => {
    const item = source[index] && typeof source[index] === "object"
      ? source[index] as Record<string, unknown>
      : null;
    const number = index + 1;
    const defaultLabel = slotType === "solo"
      ? `Solo Artist ${number}`
      : slotType === "duo" ? `Duo ${number}` : `Group ${number}`;
    const merge = (key: keyof SlotDefaults) => cleanList([
      ...(defaults[key] || []),
      ...cleanList(item?.[key]),
    ]);
    const groupType = typeof item?.group_type === "string" && item.group_type.trim()
      ? item.group_type.trim()
      : defaults.group_types?.[index] || "";
    const sourceMembers = Array.isArray(item?.members) ? item.members : [];
    const memberCount = slotType === "duo" ? 2 : slotType === "band" ? sourceMembers.length : 0;
    const members = memberCount > 0
      ? Array.from({ length: memberCount }, (_, memberIndex) => {
        const member = sourceMembers[memberIndex] && typeof sourceMembers[memberIndex] === "object"
          ? sourceMembers[memberIndex] as Record<string, unknown>
          : null;
        return {
          label: typeof member?.label === "string" && member.label.trim()
            ? member.label.trim()
            : `Member ${memberIndex + 1}`,
          roles: cleanList([
            ...(memberIndex === 0 ? defaults.roles || [] : []),
            ...(!sourceMembers.length && memberIndex === 0 ? cleanList(item?.roles) : []),
            ...cleanList(member?.roles),
          ]),
          preferred_instruments: cleanList([
            ...(memberIndex === 0 ? defaults.preferred_instruments || [] : []),
            ...(!sourceMembers.length && memberIndex === 0 ? cleanList(item?.preferred_instruments) : []),
            ...cleanList(member?.preferred_instruments),
          ]),
        };
      })
      : undefined;

    return {
      slot_id: typeof item?.slot_id === "string" && item.slot_id.trim()
        ? item.slot_id.trim()
        : `${slotType}-${number}`,
      label: typeof item?.label === "string" && item.label.trim()
        ? item.label.trim()
        : defaultLabel,
      ...(slotType === "band" ? { group_type: groupType } : {}),
      roles: slotType === "duo" ? [] : merge("roles"),
      preferred_genres: merge("preferred_genres"),
      preferred_instruments: slotType === "duo" ? [] : merge("preferred_instruments"),
      ...(members ? { members } : {}),
    };
  });
};

export const aggregateSpecificSlotRequirements = (
  items: GigSpecificSlotRequirement[],
  fallback: Partial<SlotDefaults> = {},
): SlotDefaults => ({
  roles: cleanList([
    ...(fallback.roles || []),
    ...items.flatMap((item) => [
      ...item.roles,
      ...(item.members || []).flatMap((member) => member.roles),
    ]),
  ]),
  preferred_genres: cleanList([
    ...(fallback.preferred_genres || []),
    ...items.flatMap((item) => item.preferred_genres),
  ]),
  preferred_instruments: cleanList([
    ...(fallback.preferred_instruments || []),
    ...items.flatMap((item) => [
      ...item.preferred_instruments,
      ...(item.members || []).flatMap((member) => member.preferred_instruments),
    ]),
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
    const members = Array.isArray(requirement.members) ? requirement.members : [];
    const memberDetails = members.flatMap((member, memberIndex) => {
      if (!member || typeof member !== "object") return [];
      const sourceMember = member as Record<string, unknown>;
      const details = [
        ...getRequirementList(sourceMember.roles),
        ...getRequirementList(sourceMember.preferred_instruments).map((value) => `Instrument: ${value}`),
      ];
      if (details.length === 0) return [];
      const label = typeof sourceMember.label === "string" && sourceMember.label.trim()
        ? sourceMember.label.trim()
        : `Member ${memberIndex + 1}`;
      return [`${label}: ${details.join(", ")}`];
    });
    const rawGroupType = typeof requirement.group_type === "string" ? requirement.group_type.trim() : "";
    const groupTypeLabel = rawGroupType
      ? PH_MUSIC_GROUP_TYPES.find((groupType) => groupType.id === rawGroupType)?.label
        || rawGroupType.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "";
    const details = [
      ...(groupTypeLabel ? [`Group type: ${groupTypeLabel}`] : []),
      ...getRequirementList(requirement.roles),
      ...getRequirementList(requirement.preferred_instruments).map((value) => `Instrument: ${value}`),
      ...getRequirementList(requirement.preferred_genres).map((value) => `Genre: ${value}`),
      ...memberDetails,
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
      specifics.flatMap((item) => [
        ...getRequirementList(item[key]),
        ...(key === "roles" && Array.isArray(item.members)
          ? item.members.flatMap((member) => getRequirementList((member as Record<string, unknown>)?.roles))
          : []),
        ...(key === "preferred_instruments" && Array.isArray(item.members)
          ? item.members.flatMap((member) => getRequirementList((member as Record<string, unknown>)?.preferred_instruments))
          : []),
      ]).map((value) => value.toLowerCase()),
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
    ...getSpecificSlotRequirementLines(slots.band),
  ];
  const available = Math.max(0, limit - badges.length);
  if (specificLines.length <= available) return [...badges, ...specificLines];
  if (available === 0) return badges.slice(0, limit);

  const visible = specificLines.slice(0, Math.max(0, available - 1));
  const hiddenCount = specificLines.length - visible.length;
  return [...badges, ...visible, `${hiddenCount} more slot requirement${hiddenCount === 1 ? "" : "s"}`];
};
