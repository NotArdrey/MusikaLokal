import {
  BudgetFit,
  BudgetLevel,
  ExperienceLevel,
  InstrumentCategory,
  InstrumentSuggestion,
  MusicJourneyStep,
  StarterBudget,
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

interface OfflineSuggestionInput {
  genres: string[];
  currentInstruments: string[];
  userRoles: string[];
  experienceLevel: ExperienceLevel;
  purpose: SuggestionPurpose;
  starterBudget?: StarterBudget;
  customStarterBudgetPhp?: number;
  limit: number;
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
    name: "DJ Controller",
    image:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop",
    genres: ["EDM", "Hip-Hop", "House", "Pop"],
    difficulty: "intermediate",
    category: "electronic",
    description: "Blend tracks, build transitions, and perform energetic sets.",
    relatedInstruments: ["MIDI Controller", "Studio Monitors"],
    famousPlayers: ["Martin Garrix", "Zedd"],
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
    name: "Cajon",
    image:
      "https://images.unsplash.com/photo-1458560871784-56d23406c091?w=200&h=200&fit=crop",
    genres: ["Acoustic", "Folk", "Latin", "Pop"],
    difficulty: "beginner",
    category: "percussion",
    description: "Compact percussion option for unplugged sets and small gigs.",
    relatedInstruments: ["Acoustic Guitar", "Microphone"],
    famousPlayers: ["Alex Acuna", "Paquito Gonzalez"],
  },
  {
    name: "Violin",
    image:
      "https://images.unsplash.com/photo-1612225330812-01a9c6b355ec?w=200&h=200&fit=crop",
    genres: ["Classical", "Folk", "Indie", "Cinematic"],
    difficulty: "advanced",
    category: "strings",
    description: "Expressive lead voice for melodic lines and cinematic textures.",
    relatedInstruments: ["Cello", "Piano"],
    famousPlayers: ["Hilary Hahn", "Lindsey Stirling"],
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
    name: "Trumpet",
    image:
      "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=200&h=200&fit=crop",
    genres: ["Jazz", "Latin", "Funk", "Classical"],
    difficulty: "intermediate",
    category: "wind",
    description: "Cuts through mixes with bright tone and dynamic control.",
    relatedInstruments: ["Saxophone", "Flute", "Piano"],
    famousPlayers: ["Miles Davis", "Wynton Marsalis"],
  },
  {
    name: "Flute",
    image:
      "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=200&h=200&fit=crop",
    genres: ["Classical", "Folk", "World Music", "Pop"],
    difficulty: "beginner",
    category: "wind",
    description: "Light melodic instrument with clear tone and expressive phrasing.",
    relatedInstruments: ["Saxophone", "Violin", "Piano"],
    famousPlayers: ["James Galway", "Herbie Mann"],
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
    name: "Voice",
    image:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop",
    genres: ["Pop", "R&B", "Rock", "Worship", "Acoustic", "Folk", "Soul"],
    difficulty: "beginner",
    category: "vocals",
    description: "The lowest-cost way to start making music and collaborate immediately.",
    relatedInstruments: ["Microphone", "Keyboard", "Acoustic Guitar"],
    famousPlayers: ["Lea Salonga", "Bruno Mars"],
  },
  {
    name: "Vocal Processor",
    image:
      "https://images.unsplash.com/photo-1461784180009-21121b2f204c?w=200&h=200&fit=crop",
    genres: ["Pop", "Electronic", "R&B", "Live Performance"],
    difficulty: "intermediate",
    category: "vocals",
    description: "Adds harmony, pitch effects, and consistent vocal polish.",
    relatedInstruments: ["Microphone", "Audio Interface"],
    famousPlayers: ["Bon Iver", "Imogen Heap"],
  },
  {
    name: "Music Production Apps",
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=200&h=200&fit=crop",
    genres: ["Electronic", "EDM", "Hip-Hop", "Pop", "R&B", "Recording", "All Genres"],
    difficulty: "beginner",
    category: "electronic",
    description: "Start arranging beats, loops, and demos on a phone or laptop before buying hardware.",
    relatedInstruments: ["MIDI Controller", "Audio Interface", "Studio Monitors"],
    famousPlayers: ["Finneas", "Metro Boomin"],
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

interface StarterBudgetEstimate {
  minPhp: number;
  maxPhp: number;
  includes: string[];
  searchBasis: string[];
}

const PHP = "\u20b1";
const BUDGET_ESTIMATE_NOTE =
  "Prices are estimates from online PH music-store and marketplace results; brand, sale price, and used condition can change the range.";

const BUDGET_LEVEL_BY_SELECTION: Record<StarterBudget, BudgetLevel> = {
  none: "no_budget",
  below_3000: "low",
  "3000_7000": "medium",
  "7000_15000": "medium",
  "15000_plus": "high",
  custom: "unknown",
  not_sure: "unknown",
};

const BUDGET_FIT_SCORE: Record<BudgetFit, number> = {
  fits: 14,
  stretch: 4,
  save_first: -18,
  no_spend: 16,
  unknown: 0,
};

const DEFAULT_BUDGET_ESTIMATE: StarterBudgetEstimate = {
  minPhp: 3000,
  maxPhp: 12000,
  includes: ["Starter instrument", "Basic accessory set", "Tuner or app"],
  searchBasis: ["Recent online PH store and marketplace starter listings"],
};

const STARTER_BUDGET_ESTIMATES: Record<string, StarterBudgetEstimate> = {
  "Acoustic Guitar": {
    minPhp: 4000,
    maxPhp: 8000,
    includes: ["Entry-level acoustic guitar", "Clip-on tuner or tuner app", "Picks", "Strap"],
    searchBasis: ["JB Music and other PH acoustic guitar listings"],
  },
  "Electric Guitar": {
    minPhp: 9000,
    maxPhp: 22000,
    includes: ["Entry-level electric guitar", "Practice amplifier", "Instrument cable", "Tuner", "Strap"],
    searchBasis: ["PH electric guitar, amp, and cable listings"],
  },
  "Bass Guitar": {
    minPhp: 7000,
    maxPhp: 18000,
    includes: ["Entry-level bass guitar", "Practice amplifier", "Instrument cable", "Tuner", "Strap"],
    searchBasis: ["Audiophile bass listings", "JB Music bass amplifier listing", "PH used-market bass bundles"],
  },
  Ukulele: {
    minPhp: 1500,
    maxPhp: 5000,
    includes: ["Soprano or concert ukulele", "Tuner app", "Soft case", "Extra strings"],
    searchBasis: ["JB Music ukulele listings", "PH marketplace ukulele listings"],
  },
  Piano: {
    minPhp: 15000,
    maxPhp: 40000,
    includes: ["Digital piano or weighted keyboard", "Power adaptor", "Stand", "Sustain pedal"],
    searchBasis: ["JB Music, Audiophile, and Lazer Music digital piano listings"],
  },
  Keyboard: {
    minPhp: 5000,
    maxPhp: 15000,
    includes: ["61-key beginner keyboard", "Power adaptor", "Basic stand", "Headphones"],
    searchBasis: ["JB Music and Lazer Music keyboard listings"],
  },
  Synthesizer: {
    minPhp: 12000,
    maxPhp: 35000,
    includes: ["Entry-level synthesizer", "Headphones", "Audio cable", "Power adaptor"],
    searchBasis: ["PH synthesizer and keyboard listings"],
  },
  "MIDI Controller": {
    minPhp: 2500,
    maxPhp: 10000,
    includes: ["25- or 37-key MIDI controller", "USB cable", "Free DAW or mobile production app"],
    searchBasis: ["PH MIDI controller and USB keyboard listings"],
  },
  "DJ Controller": {
    minPhp: 8000,
    maxPhp: 22000,
    includes: ["Beginner DJ controller", "Laptop or phone app", "Headphones", "USB cable"],
    searchBasis: ["PH DJ controller listings"],
  },
  "Drum Kit": {
    minPhp: 18000,
    maxPhp: 45000,
    includes: ["Entry drum kit or compact electronic kit", "Sticks", "Throne", "Practice pad"],
    searchBasis: ["PH beginner drum kit and electronic drum listings"],
  },
  Cajon: {
    minPhp: 2500,
    maxPhp: 6000,
    includes: ["Beginner cajon", "Carry bag if bundled", "Metronome app"],
    searchBasis: ["Lazer Music cajon listings", "PH marketplace cajon listings"],
  },
  Violin: {
    minPhp: 4500,
    maxPhp: 15000,
    includes: ["Student violin outfit", "Bow", "Rosin", "Case", "Tuner app"],
    searchBasis: ["PH student violin listings"],
  },
  Saxophone: {
    minPhp: 18000,
    maxPhp: 45000,
    includes: ["Student alto saxophone", "Mouthpiece", "Reeds", "Neck strap", "Case"],
    searchBasis: ["PH student saxophone listings"],
  },
  Trumpet: {
    minPhp: 9000,
    maxPhp: 28000,
    includes: ["Student trumpet", "Mouthpiece", "Valve oil", "Case"],
    searchBasis: ["PH student trumpet listings"],
  },
  Flute: {
    minPhp: 2500,
    maxPhp: 12000,
    includes: ["Student flute", "Cleaning rod", "Case", "Tuner app"],
    searchBasis: ["PH student flute listings"],
  },
  Microphone: {
    minPhp: 1000,
    maxPhp: 6000,
    includes: ["Dynamic or USB microphone", "Cable or USB lead", "Stand or clip", "Pop filter"],
    searchBasis: ["Swee Lee and PH microphone listings"],
  },
  Voice: {
    minPhp: 0,
    maxPhp: 1000,
    includes: ["Phone recorder", "Free vocal warmups", "Earbuds or headphones"],
    searchBasis: ["No dedicated instrument purchase required"],
  },
  "Vocal Processor": {
    minPhp: 8000,
    maxPhp: 22000,
    includes: ["Entry vocal processor", "Microphone cable", "Power adaptor", "Microphone"],
    searchBasis: ["PH vocal processor and effects listings"],
  },
  "Music Production Apps": {
    minPhp: 0,
    maxPhp: 3500,
    includes: ["Free or low-cost DAW/mobile app", "Phone or laptop", "Earbuds", "Starter sample packs"],
    searchBasis: ["Free DAW/mobile app options", "PH budget audio accessory listings"],
  },
  "Audio Interface": {
    minPhp: 3500,
    maxPhp: 12000,
    includes: ["USB audio interface", "USB cable", "Headphones", "Free recording software"],
    searchBasis: ["Swee Lee and PH audio-interface listings"],
  },
  "Studio Monitors": {
    minPhp: 8000,
    maxPhp: 22000,
    includes: ["Pair of entry studio monitors", "TRS or RCA cables", "Basic isolation pads"],
    searchBasis: ["PH studio monitor listings"],
  },
  "Looper Pedal": {
    minPhp: 4500,
    maxPhp: 12000,
    includes: ["Looper pedal", "Instrument cables", "Power supply", "Existing guitar or microphone setup"],
    searchBasis: ["PH guitar pedal and looper listings"],
  },
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

const formatPhpAmount = (value: number) => `${PHP}${value.toLocaleString("en-US")}`;

const formatBudgetRange = (estimate: StarterBudgetEstimate) =>
  `${formatPhpAmount(estimate.minPhp)}-${formatPhpAmount(estimate.maxPhp)}`;

const getBudgetEstimate = (item: LocalInstrumentProfile) =>
  STARTER_BUDGET_ESTIMATES[item.name] || DEFAULT_BUDGET_ESTIMATE;

const sanitizeCustomBudgetPhp = (value?: number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return Math.round(amount);
};

const getBudgetLevelForAmount = (amount?: number): BudgetLevel => {
  if (!amount) return "unknown";
  if (amount < 3000) return "low";
  if (amount <= 15000) return "medium";
  return "high";
};

const getBudgetLevel = (
  starterBudget: StarterBudget,
  customBudgetPhp?: number,
): BudgetLevel => {
  if (starterBudget === "custom") {
    return getBudgetLevelForAmount(customBudgetPhp);
  }

  return BUDGET_LEVEL_BY_SELECTION[starterBudget] || "unknown";
};

const getBudgetFit = (
  starterBudget: StarterBudget,
  estimate: StarterBudgetEstimate,
  customBudgetPhp?: number,
): BudgetFit => {
  if (starterBudget === "custom") {
    const amount = sanitizeCustomBudgetPhp(customBudgetPhp);
    if (!amount) return "unknown";
    if (estimate.maxPhp <= amount * 1.25) return "fits";
    return estimate.minPhp <= amount ? "stretch" : "save_first";
  }

  if (starterBudget === "not_sure") return "unknown";
  if (starterBudget === "none") return estimate.minPhp <= 0 ? "no_spend" : "save_first";
  if (starterBudget === "below_3000") return estimate.minPhp <= 3000 ? "fits" : "save_first";
  if (starterBudget === "3000_7000") {
    if (estimate.maxPhp <= 8750) return "fits";
    return estimate.minPhp <= 7000 ? "stretch" : "save_first";
  }
  if (starterBudget === "7000_15000") {
    if (estimate.maxPhp <= 22500) return "fits";
    return estimate.minPhp <= 15000 ? "stretch" : "save_first";
  }

  if (estimate.minPhp <= 25000) return "fits";
  return "stretch";
};

const buildBudgetNote = (
  fit: BudgetFit,
  estimate: StarterBudgetEstimate,
): string => {
  const range = formatBudgetRange(estimate);
  if (fit === "no_spend") {
    return `You can start now with little or no spend. Estimated starter range: ${range}.`;
  }
  if (fit === "fits") {
    return `This is realistic for your stated budget. Estimated starter range: ${range}.`;
  }
  if (fit === "stretch") {
    return `This may need used gear or buying essentials first. Estimated starter range: ${range}.`;
  }
  if (fit === "save_first") {
    return `This setup usually costs above your stated budget. Estimated starter range: ${range}.`;
  }
  return `Use this as a planning range: ${range}.`;
};

const RECOMMENDED_ROLE_BY_INSTRUMENT: Record<string, string> = {
  "Acoustic Guitar": "Singer-songwriter / Rhythm Guitarist",
  "Electric Guitar": "Lead or Rhythm Guitarist",
  "Bass Guitar": "Bassist",
  Ukulele: "Acoustic Companion",
  Piano: "Keys Player",
  Keyboard: "Keys Player",
  Synthesizer: "Synth Player",
  "MIDI Controller": "Producer",
  "DJ Controller": "DJ / Live Selector",
  "Drum Kit": "Drummer",
  Cajon: "Acoustic Percussionist",
  Violin: "String Lead",
  Saxophone: "Horn Lead",
  Trumpet: "Brass Lead",
  Flute: "Melody Player",
  Microphone: "Vocalist",
  Voice: "Vocalist",
  "Vocal Processor": "Vocal Performer",
  "Music Production Apps": "Producer",
  "Audio Interface": "Home Recording Artist",
  "Studio Monitors": "Mixing Producer",
  "Looper Pedal": "Looping Soloist",
};

const getRecommendedRole = (item: LocalInstrumentProfile, purpose: SuggestionPurpose) => {
  const role = RECOMMENDED_ROLE_BY_INSTRUMENT[item.name];
  if (role) return role;
  if (purpose === "production") return "Producer";
  if (item.category === "vocals") return "Vocalist";
  if (item.category === "percussion") return "Rhythm Player";
  return "Musician";
};

const buildRoleFitReason = (
  item: LocalInstrumentProfile,
  purpose: SuggestionPurpose,
  genreMatches: string[],
) => {
  const role = getRecommendedRole(item, purpose);
  const genreCopy = genreMatches.length > 0 ? ` for ${genreMatches.slice(0, 2).join(" and ")}` : "";
  if (purpose === "band") {
    return `${role} fits because it gives a group a clear musical job${genreCopy}.`;
  }
  if (purpose === "solo") {
    return `${role} fits because it can carry a personal practice or performance path${genreCopy}.`;
  }
  if (purpose === "studio") {
    return `${role} fits because it creates useful parts for recording sessions${genreCopy}.`;
  }
  return `${role} fits because it helps you build tracks and demos${genreCopy}.`;
};

const PRACTICE_FOCUS_BY_CATEGORY: Record<InstrumentCategory, string> = {
  strings: "clean fretting, simple chord changes, and two-song rhythm practice",
  keyboards: "major chords, left-right coordination, and a four-chord progression",
  percussion: "steady 4/4 time, kick/snare patterns, and dynamics",
  wind: "breath support, long tones, and one short melody",
  electronic: "one beat loop, one bass line, and one simple arrangement",
  vocals: "breath control, pitch matching, and one recorded chorus",
  amplification: "clean signal flow, timing, and one looped arrangement",
  recording: "gain staging, one clean take, and a simple rough mix",
};

const buildLearningPlan = (
  item: LocalInstrumentProfile,
  purpose: SuggestionPurpose,
): MusicJourneyStep[] => {
  const focus = PRACTICE_FOCUS_BY_CATEGORY[item.category];
  return [
    {
      title: "Days 1-7",
      detail: `Set up the basics and spend 15 minutes daily on ${focus}.`,
    },
    {
      title: "Days 8-21",
      detail: `Practice with a metronome or backing track and learn one ${purpose === "production" ? "16-bar idea" : "complete song section"}.`,
    },
    {
      title: "Days 22-30",
      detail: "Record a short clip, review timing and tone, then share it for feedback.",
    },
  ];
};

const buildNextMission = (item: LocalInstrumentProfile) => {
  if (item.name === "Music Production Apps" || item.category === "electronic") {
    return "Create and upload your first 16-bar loop.";
  }
  if (item.category === "percussion") {
    return "Upload your first 30-second steady groove clip.";
  }
  if (item.category === "vocals") {
    return "Upload your first 30-second verse or chorus clip.";
  }
  if (item.category === "recording") {
    return "Record and upload one clean 30-second demo take.";
  }
  return "Upload your first 30-second practice clip.";
};

const ownsRelatedInstrument = (
  item: LocalInstrumentProfile,
  normalizedCurrent: string[],
) => {
  const itemKeywords = [item.name, ...item.relatedInstruments, getRecommendedRole(item, "band")]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);

  return normalizedCurrent.some((owned) =>
    itemKeywords.some((keyword) => owned.includes(keyword) || keyword.includes(owned)),
  );
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
  starterBudget = "not_sure",
  customStarterBudgetPhp,
  limit,
}: OfflineSuggestionInput): InstrumentSuggestion[] => {
  const normalizedGenres = genres.map(normalize);
  const normalizedCurrent = currentInstruments.map(normalize);
  const normalizedRoles = userRoles.map(normalize);
  const purposeBoostCategories = PURPOSE_CATEGORY_BOOST[purpose];
  const safeCustomBudgetPhp = sanitizeCustomBudgetPhp(customStarterBudgetPhp);
  const budgetLevel = getBudgetLevel(starterBudget, safeCustomBudgetPhp);

  const ranked = LOCAL_CATALOG
    .filter((item) => {
      const itemName = normalize(item.name);
      return !normalizedCurrent.some((owned) => owned.includes(itemName) || itemName.includes(owned));
    })
    .map((item) => {
      const itemGenresNormalized = item.genres.map(normalize);
      const genreMatches = normalizedGenres.filter((genre) => itemGenresNormalized.includes(genre));
      const budgetEstimate = getBudgetEstimate(item);
      const budgetFit = getBudgetFit(starterBudget, budgetEstimate, safeCustomBudgetPhp);
      const alreadyOwnsRelated = ownsRelatedInstrument(item, normalizedCurrent);

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
      score += alreadyOwnsRelated
        ? Math.max(0, Math.min(6, BUDGET_FIT_SCORE[budgetFit]))
        : BUDGET_FIT_SCORE[budgetFit];
      score += hashString(item.name) % 5;

      const safeScore = clamp(Math.round(score), 40, 98);
      const learningCurve = inferLearningCurve(experienceLevel, item.difficulty);
      const timeToBasics = estimateTimeToBasics(learningCurve, experienceLevel);
      const recommendedRole = getRecommendedRole(item, purpose);

      const reasons: string[] = [];
      if (genreMatches.length > 0) {
        reasons.push(`Great fit for your ${genreMatches.slice(0, 2).join(" and ")} preferences.`);
      }
      if (normalizedRoles.length > 0) {
        reasons.push(`Complements your current role setup as ${userRoles.slice(0, 2).join(" / ")}.`);
      }
      if (budgetFit === "fits" || budgetFit === "no_spend") {
        reasons.push(`Your budget can realistically start this path.`);
      } else if (budgetFit === "stretch") {
        reasons.push(`Your budget can work if you buy used gear or start with essentials.`);
      } else if (budgetFit === "save_first") {
        reasons.push(`It is useful long-term, but the starter setup is above your current budget.`);
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
        recommendedRole,
        roleFitReason: buildRoleFitReason(item, purpose, genreMatches),
        budgetLevel,
        starterBudget,
        customStarterBudgetPhp: starterBudget === "custom" ? safeCustomBudgetPhp : undefined,
        estimatedStarterBudget: formatBudgetRange(budgetEstimate),
        starterBudgetMinPhp: budgetEstimate.minPhp,
        starterBudgetMaxPhp: budgetEstimate.maxPhp,
        starterGear: budgetEstimate.includes,
        budgetFit,
        budgetNote: `${buildBudgetNote(budgetFit, budgetEstimate)} ${BUDGET_ESTIMATE_NOTE}`,
        budgetSearchBasis: budgetEstimate.searchBasis,
        learningPlan: buildLearningPlan(item, purpose),
        nextMission: buildNextMission(item),
      } satisfies InstrumentSuggestion;
    })
    .sort((a, b) => b.score - a.score);

  const safeLimit = clamp(limit || 10, 3, 20);
  return diversifyByCategory(ranked, safeLimit);
};
