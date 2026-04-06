export interface GroupTypeDefinition {
    id: string;
    label: string;
    minMembers: number;
    requiredRoles: string[];
    optionalRoles: string[];
    description: string;
    example: string;
}

export const PH_MUSIC_GROUP_TYPES: GroupTypeDefinition[] = [
    {
        id: "standard_opm_band",
        label: "Standard OPM Band",
        minMembers: 4,
        requiredRoles: ["Lead Vocalist", "Guitarist", "Bassist", "Drummer"],
        optionalRoles: [
            "Keyboardist",
            "Rhythm Guitarist",
            "Backing Vocalist",
            "Percussionist",
            "Saxophonist",
        ],
        description:
            "If the vocalist also plays guitar, minimum can be 3, but standard industry setup is 4.",
        example: "Eraserheads",
    },
    {
        id: "vocal_group",
        label: "Vocal Group",
        minMembers: 3,
        requiredRoles: ["Lead Vocalist", "Harmony Vocalist", "Harmony Vocalist"],
        optionalRoles: ["Beatboxer", "Vocal Arranger", "Choreographer"],
        description: "Group focused primarily on vocal harmonies.",
        example: "The CompanY",
    },
    {
        id: "ppop_group",
        label: "P-Pop Group",
        minMembers: 5,
        requiredRoles: [
            "Leader",
            "Main Vocalist",
            "Lead Vocalist",
            "Main Dancer",
            "Rapper",
        ],
        optionalRoles: ["Visual", "Center", "Sub-vocalist", "Sub-rapper", "Maknae"],
        description:
            "Some roles can overlap (one member can be both Main Dancer & Rapper).",
        example: "SB19",
    },
    {
        id: "acoustic_duo",
        label: "Acoustic Duo",
        minMembers: 2,
        requiredRoles: ["Vocalist", "Guitarist or Pianist"],
        optionalRoles: ["Cajón Player", "Backup Vocalist", "Bassist"],
        description: "Intimate two-piece acoustic setup.",
        example: "Ben&Ben (early formation)",
    },
    {
        id: "hiphop_rap_group",
        label: "Hip-Hop / Rap Group",
        minMembers: 2,
        requiredRoles: ["Main Rapper", "Secondary Rapper"],
        optionalRoles: ["DJ", "Producer", "Singer (for chorus)", "Hype Man"],
        description: "Producer can be external (not always counted as member).",
        example: "Ex Battalion",
    },
    {
        id: "choir",
        label: "Choir",
        minMembers: 5,
        requiredRoles: ["Soprano", "Alto", "Tenor", "Bass", "Conductor"],
        optionalRoles: ["Pianist / Accompanist", "Section Leaders"],
        description:
            "That’s the technical minimum (1 per voice part). Real industry choirs usually start at 12+ members.",
        example: "Philippine Madrigal Singers",
    },
    {
        id: "orchestra",
        label: "Orchestra",
        minMembers: 9,
        requiredRoles: [
            "String Section (Violin, Viola, Cello, Bass)",
            "Woodwind",
            "Brass",
            "Percussion",
            "Keyboard / Harp",
            "Conductor",
        ],
        optionalRoles: [],
        description:
            "Professional orchestras are usually 30–80 members.",
        example: "Philippine Philharmonic Orchestra",
    },
    {
        id: "rondalla",
        label: "Rondalla",
        minMembers: 5,
        requiredRoles: [
            "Bandurria",
            "Octavina",
            "Laud",
            "Guitar",
            "Bajo de Uñas",
        ],
        optionalRoles: ["Singer", "Extra Bandurria players"],
        description: "Traditional string ensemble.",
        example: "Celso Espejo Rondalla",
    },
    {
        id: "church_worship_band",
        label: "Church Worship Band",
        minMembers: 3,
        requiredRoles: [
            "Lead Vocalist",
            "Keyboardist or Guitarist",
            "Music Director",
        ],
        optionalRoles: ["Drummer", "Bassist", "Backup Vocalist"],
        description: "Music Director can be one of the instrumentalists.",
        example: "Victory Worship",
    },
    {
        id: "showband_events_band",
        label: "Showband / Events Band",
        minMembers: 5,
        requiredRoles: [
            "Lead Singer",
            "Guitarist",
            "Bassist",
            "Drummer",
            "Keyboardist",
        ],
        optionalRoles: ["Female/Male Dual Vocalists", "Horn Section", "Dancers"],
        description: "Versatile band meant for events, parties, and shows.",
        example: "3rd Avenue",
    },
    {
        id: "dj_producer_group",
        label: "DJ / Producer Group",
        minMembers: 1,
        requiredRoles: ["DJ / Producer"],
        optionalRoles: ["Vocalist", "Hype Man", "Visual Performer"],
        description: "Electronic music setup.",
        example: "Manila Killa",
    },
];

const PH_GROUP_TYPE_IDS = new Set(PH_MUSIC_GROUP_TYPES.map((type) => type.id));

export const mapDbGroupTypeToUiGroupType = (groupType?: string): string => {
    const normalized = String(groupType || "").trim().toLowerCase();

    if (PH_GROUP_TYPE_IDS.has(normalized)) {
        return normalized;
    }

    if (normalized === "duo") {
        return "acoustic_duo";
    }

    return "standard_opm_band";
};

export const mapUiGroupTypeToDbGroupType = (groupType?: string): "duo" | "band" => {
    const normalized = String(groupType || "").trim().toLowerCase();
    return normalized === "duo" || normalized === "acoustic_duo" ? "duo" : "band";
};

export const isDuoGroupType = (groupType?: string): boolean => {
    return mapUiGroupTypeToDbGroupType(groupType) === "duo";
};
