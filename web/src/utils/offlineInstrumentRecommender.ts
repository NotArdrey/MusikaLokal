import {
  ExperienceLevel,
  InstrumentCategory,
  InstrumentSuggestion,
  SuggestionPurpose,
} from "../types/instruments";

export interface LocalInstrumentProfile {
  name: string;
  image: string;
  genres: string[];
  difficulty: ExperienceLevel;
  category: InstrumentCategory;
  description: string;
  relatedInstruments: string[];
  famousPlayers: string[];
}

const LOCAL_CATALOG: LocalInstrumentProfile[] = [
  {
    name: "Acoustic Guitar",
    image:
      "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200&h=200&fit=crop",
    genres: ["Folk", "Country", "Acoustic", "Indie", "Pop"],
    difficulty: "beginner",
    category: "strings",
    description: "Warm and versatile for songwriting, busking, and stripped-down sets.",
    relatedInstruments: ["Electric Guitar", "Ukulele", "Bass Guitar"],
    famousPlayers: ["Ed Sheeran", "John Mayer"],
  },
  {
    name: "Electric Guitar",
    image:
      "https://images.unsplash.com/photo-1550985616-10810253b84d?w=200&h=200&fit=crop",
    genres: ["Rock", "Metal", "Blues", "Alternative", "Indie"],
    difficulty: "beginner",
    category: "strings",
    description: "Great for rhythm riffs, lead hooks, and stage-ready tones.",
    relatedInstruments: ["Acoustic Guitar", "Bass Guitar", "Looper Pedal"],
    famousPlayers: ["Jimi Hendrix", "John Frusciante"],
  },
  {
    name: "Bass Guitar",
    image:
      "https://images.unsplash.com/photo-1461784180009-21121b2f204c?w=200&h=200&fit=crop",
    genres: ["Rock", "Jazz", "Funk", "R&B", "Pop"],
    difficulty: "beginner",
    category: "strings",
    description: "Locks in groove and timing while supporting the whole arrangement.",
    relatedInstruments: ["Electric Guitar", "Drum Kit", "Keyboard"],
    famousPlayers: ["Flea", "Victor Wooten"],
  },
  {
    name: "Ukulele",
    image:
      "https://images.unsplash.com/photo-1556449895-a33c9dba33dd?w=200&h=200&fit=crop",
    genres: ["Folk", "Pop", "Acoustic", "Indie"],
    difficulty: "beginner",
    category: "strings",
    description: "Portable and beginner-friendly for quick musical wins.",
    relatedInstruments: ["Acoustic Guitar", "Keyboard"],
    famousPlayers: ["Jake Shimabukuro", "Israel Kamakawiwoole"],
  },
  {
    name: "Piano",
    image:
      "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=200&h=200&fit=crop",
    genres: ["Classical", "Jazz", "Pop", "R&B", "Soul"],
    difficulty: "intermediate",
    category: "keyboards",
    description: "Builds music theory and works in almost any genre.",
    relatedInstruments: ["Keyboard", "Synthesizer", "Microphone"],
    famousPlayers: ["Herbie Hancock", "Alicia Keys"],
  },
  {
    name: "Keyboard",
    image:
      "https://images.unsplash.com/photo-1552422535-c45813c61732?w=200&h=200&fit=crop",
    genres: ["Pop", "Rock", "Worship", "Electronic", "Jazz"],
    difficulty: "beginner",
    category: "keyboards",
    description: "Flexible sounds for live sets, arrangements, and songwriting.",
    relatedInstruments: ["Piano", "Synthesizer", "MIDI Controller"],
    famousPlayers: ["Jordan Rudess", "Cory Henry"],
  },
  {
    name: "Synthesizer",
    image:
      "https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=200&h=200&fit=crop",
    genres: ["Electronic", "EDM", "Synthpop", "Ambient", "Pop"],
    difficulty: "intermediate",
    category: "electronic",
    description: "Design signature sounds and textures for modern production.",
    relatedInstruments: ["MIDI Controller", "Keyboard", "Studio Monitors"],
    famousPlayers: ["Daft Punk", "Trent Reznor"],
  },
  {
    name: "MIDI Controller",
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=200&h=200&fit=crop",
    genres: ["Electronic", "Hip-Hop", "EDM", "Pop", "R&B"],
    difficulty: "beginner",
    category: "electronic",
    description: "Control virtual instruments and speed up beat making.",
    relatedInstruments: ["Synthesizer", "Audio Interface", "Studio Monitors"],
    famousPlayers: ["FKJ", "Flume"],
  },
  {
    name: "Drum Kit",
    image:
      "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=200&h=200&fit=crop",
    genres: ["Rock", "Metal", "Funk", "Pop", "Jazz"],
    difficulty: "intermediate",
    category: "percussion",
    description: "Drives tempo, dynamics, and energy in any live band.",
    relatedInstruments: ["Cajon", "Bass Guitar", "Metronome"],
    famousPlayers: ["Dave Grohl", "Questlove"],
  },
  {
    name: "Saxophone",
    image:
      "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=200&h=200&fit=crop",
    genres: ["Jazz", "Soul", "R&B", "Funk"],
    difficulty: "advanced",
    category: "wind",
    description: "Powerful phrasing instrument for solos and expressive hooks.",
    relatedInstruments: ["Trumpet", "Piano", "Microphone"],
    famousPlayers: ["Charlie Parker", "Kenny G"],
  },
  {
    name: "Microphone",
    image:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=200&h=200&fit=crop",
    genres: ["Pop", "R&B", "Rock", "Worship", "Acoustic"],
    difficulty: "beginner",
    category: "vocals",
    description: "Essential for vocals, podcasts, and clean live voice projection.",
    relatedInstruments: ["Audio Interface", "Studio Monitors", "Vocal Processor"],
    famousPlayers: ["Freddie Mercury", "Whitney Houston"],
  },
  {
    name: "Audio Interface",
    image:
      "https://images.unsplash.com/photo-1593697972672-b1c1368f0a6f?w=200&h=200&fit=crop",
    genres: ["Recording", "All Genres", "Production"],
    difficulty: "beginner",
    category: "recording",
    description: "Connects instruments and microphones for clean recording workflow.",
    relatedInstruments: ["Microphone", "Studio Monitors", "DAW Software"],
    famousPlayers: ["Rick Rubin", "Finneas"],
  },
  {
    name: "Studio Monitors",
    image:
      "https://images.unsplash.com/photo-1589903308904-1010c2294adc?w=200&h=200&fit=crop",
    genres: ["Recording", "Electronic", "Hip-Hop", "All Genres"],
    difficulty: "beginner",
    category: "recording",
    description: "Improves mix decisions with accurate sound reproduction.",
    relatedInstruments: ["Audio Interface", "MIDI Controller"],
    famousPlayers: ["Deadmau5", "Skrillex"],
  },
  {
    name: "Looper Pedal",
    image:
      "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=200&h=200&fit=crop",
    genres: ["Indie", "Pop", "Rock", "Acoustic"],
    difficulty: "intermediate",
    category: "amplification",
    description: "Layers parts live for fuller solo and duo performances.",
    relatedInstruments: ["Electric Guitar", "Acoustic Guitar", "Microphone"],
    famousPlayers: ["Tash Sultana", "Ed Sheeran"],
  },
];

export const getOfflineInstrumentCatalog = (): LocalInstrumentProfile[] =>
  LOCAL_CATALOG.map((item) => ({ ...item }));

const LEVEL_SCORE: Record<ExperienceLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const PURPOSE_CATEGORY_BOOST: Record<SuggestionPurpose, InstrumentCategory[]> = {
  band: ["strings", "percussion", "wind", "keyboards", "vocals"],
  solo: ["strings", "keyboards", "vocals", "amplification"],
  studio: ["recording", "electronic", "keyboards", "vocals"],
  production: ["electronic", "recording", "keyboards", "amplification"],
};

const CATEGORY_PRO_TIPS: Record<InstrumentCategory, string> = {
  strings: "Practice transitions with a metronome for 10 minutes daily.",
  keyboards: "Start with simple chord progressions before adding voicing complexity.",
  percussion: "Train consistency first; tempo control beats speed every time.",
  wind: "Work on breath support and long tones before advanced runs.",
  electronic: "Save presets by genre so you can build sounds faster in sessions.",
  vocals: "Record dry takes and listen back to improve pitch and control.",
  amplification: "Keep gain staging clean to avoid unwanted clipping or noise.",
  recording: "Use reference tracks and level-match before making EQ decisions.",
};

const ROLE_CATEGORY_COMPLEMENTS: Array<{ keywords: string[]; categories: InstrumentCategory[] }> = [
  { keywords: ["guitar", "guitarist"], categories: ["percussion", "keyboards", "recording"] },
  { keywords: ["drum", "drummer"], categories: ["strings", "keyboards", "recording"] },
  { keywords: ["bass", "bassist"], categories: ["percussion", "keyboards", "recording"] },
  { keywords: ["vocal", "singer"], categories: ["keyboards", "recording", "electronic"] },
  { keywords: ["producer", "beat", "dj"], categories: ["electronic", "recording", "amplification"] },
  { keywords: ["piano", "keys", "keyboard"], categories: ["vocals", "strings", "recording"] },
];

const normalize = (value: string) => value.trim().toLowerCase();

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const inferLearningCurve = (
  userLevel: ExperienceLevel,
  instrumentLevel: ExperienceLevel,
): "easy" | "moderate" | "challenging" => {
  const diff = LEVEL_SCORE[instrumentLevel] - LEVEL_SCORE[userLevel];
  if (diff <= -1) return "easy";
  if (diff === 0) return "moderate";
  return "challenging";
};

const estimateTimeToBasics = (
  learningCurve: "easy" | "moderate" | "challenging",
  userLevel: ExperienceLevel,
): string => {
  if (learningCurve === "easy") {
    if (userLevel === "advanced") return "3-10 days";
    if (userLevel === "intermediate") return "1-3 weeks";
    return "3-6 weeks";
  }

  if (learningCurve === "moderate") {
    if (userLevel === "advanced") return "2-4 weeks";
    if (userLevel === "intermediate") return "4-8 weeks";
    return "2-4 months";
  }

  if (userLevel === "advanced") return "4-10 weeks";
  if (userLevel === "intermediate") return "2-4 months";
  return "4-8 months";
};

const computeRoleBoost = (
  categories: InstrumentCategory[],
  normalizedRoles: string[],
): number => {
  if (normalizedRoles.length === 0) return 0;

  let boost = 0;
  for (const roleRule of ROLE_CATEGORY_COMPLEMENTS) {
    const hasRoleKeyword = roleRule.keywords.some((keyword) =>
      normalizedRoles.some((role) => role.includes(keyword)),
    );

    if (hasRoleKeyword && roleRule.categories.some((cat) => categories.includes(cat))) {
      boost += 5;
    }
  }

  return Math.min(15, boost);
};

const buildHeadline = (item: LocalInstrumentProfile, purpose: SuggestionPurpose) => {
  const purposeLabel =
    purpose === "band"
      ? "band-ready"
      : purpose === "solo"
      ? "solo-friendly"
      : purpose === "studio"
      ? "studio-focused"
      : "production-ready";

  return `${item.name} is a ${purposeLabel} upgrade`;
};

const buildPerfectFor = (item: LocalInstrumentProfile, purpose: SuggestionPurpose) => {
  if (purpose === "band") {
    if (item.category === "percussion") return "groove backbone";
    if (item.category === "vocals") return "frontline vocals";
    return "band arrangement";
  }

  if (purpose === "solo") {
    if (item.category === "amplification") return "live looping";
    return "solo performance";
  }

  if (purpose === "studio") {
    if (item.category === "recording") return "recording workflow";
    return "studio sessions";
  }

  return item.category === "electronic" ? "beat production" : "home production";
};

const diversifyByCategory = (
  rankedItems: InstrumentSuggestion[],
  limit: number,
): InstrumentSuggestion[] => {
  const selected: InstrumentSuggestion[] = [];
  const selectedNames = new Set<string>();
  const categoryCounts = new Map<InstrumentCategory, number>();

  const pushIfEligible = (
    item: InstrumentSuggestion,
    maxPerCategory: number,
  ) => {
    const nameKey = item.name.toLowerCase();
    if (selectedNames.has(nameKey)) return false;

    const currentCount = categoryCounts.get(item.category) || 0;
    if (currentCount >= maxPerCategory) return false;

    selected.push(item);
    selectedNames.add(nameKey);
    categoryCounts.set(item.category, currentCount + 1);
    return true;
  };

  for (const item of rankedItems) {
    pushIfEligible(item, 1);
    if (selected.length >= limit) {
      return selected.slice(0, limit);
    }
  }

  const softCap = Math.max(2, Math.ceil(limit / 3));
  for (const item of rankedItems) {
    pushIfEligible(item, softCap);
    if (selected.length >= limit) {
      return selected.slice(0, limit);
    }
  }

  for (const item of rankedItems) {
    const nameKey = item.name.toLowerCase();
    if (selectedNames.has(nameKey)) continue;
    selected.push(item);
    selectedNames.add(nameKey);
    if (selected.length >= limit) {
      return selected.slice(0, limit);
    }
  }

  return selected.slice(0, limit);
};

export const getOfflineInstrumentSuggestions = ({
  genres,
  currentInstruments,
  userRoles,
  experienceLevel,
  purpose,
  limit,
}: {
  genres: string[];
  currentInstruments: string[];
  userRoles: string[];
  experienceLevel: ExperienceLevel;
  purpose: SuggestionPurpose;
  limit: number;
}): InstrumentSuggestion[] => {
  const normalizedGenres = genres.map(normalize);
  const normalizedCurrent = currentInstruments.map(normalize);
  const normalizedRoles = userRoles.map(normalize);
  const purposeBoostCategories = PURPOSE_CATEGORY_BOOST[purpose];

  const ranked = LOCAL_CATALOG
    .filter((item) => {
      const itemName = normalize(item.name);
      return !normalizedCurrent.some((owned) => owned.includes(itemName) || itemName.includes(owned));
    })
    .map((item) => {
      const itemGenresNormalized = item.genres.map(normalize);
      const genreMatches = normalizedGenres.filter((genre) => itemGenresNormalized.includes(genre));

      let score = 52;
      score += Math.min(36, genreMatches.length * 12);

      if (purposeBoostCategories.includes(item.category)) {
        score += 12;
      }

      const experienceDelta = LEVEL_SCORE[item.difficulty] - LEVEL_SCORE[experienceLevel];
      if (experienceDelta === 0) score += 10;
      else if (experienceDelta < 0) score += 8;
      else if (experienceDelta === 1) score += 4;
      else score -= 5;

      score += computeRoleBoost([item.category], normalizedRoles);
      score += hashString(item.name) % 5;

      const safeScore = clamp(Math.round(score), 40, 98);
      const learningCurve = inferLearningCurve(experienceLevel, item.difficulty);
      const timeToBasics = estimateTimeToBasics(learningCurve, experienceLevel);

      const reasons: string[] = [];
      if (genreMatches.length > 0) {
        reasons.push(`Great fit for your ${genreMatches.slice(0, 2).join(" and ")} preferences.`);
      }
      if (normalizedRoles.length > 0) {
        reasons.push(`Complements your current role setup as ${userRoles.slice(0, 2).join(" / ")}.`);
      }
      reasons.push(item.description);

      return {
        name: item.name,
        image: item.image,
        score: safeScore,
        headline: buildHeadline(item, purpose),
        matchReason: reasons.join(" "),
        learningCurve,
        timeToBasics,
        proTip: CATEGORY_PRO_TIPS[item.category],
        famousPlayers: item.famousPlayers.slice(0, 2),
        perfectFor: buildPerfectFor(item, purpose),
        genres: item.genres,
        difficulty: item.difficulty,
        category: item.category,
        description: item.description,
        relatedInstruments: item.relatedInstruments,
        aiPowered: false,
        aiProvider: "Local Ranker",
      } as InstrumentSuggestion;
    })
    .sort((a, b) => b.score - a.score);

  const safeLimit = clamp(limit || 10, 3, 20);
  return diversifyByCategory(ranked, safeLimit);
};
