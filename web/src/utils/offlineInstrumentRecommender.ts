import {
  ExperienceLevel,
  InstrumentCategory,
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
