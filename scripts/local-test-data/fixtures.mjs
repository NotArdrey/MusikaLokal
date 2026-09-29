export const TEST_PASSWORD = "pass123";
export const QC = { latitude: 14.676, longitude: 121.0437, location: "Quezon City, Philippines" };

export const people = [
  { key: "adrian", name: "Adrian Velasco", email: "adrian.velasco@musikalokal.test", role: "musician", location: "Quezon City", image: "adrian-velasco.png", cv: "adrian-velasco.txt", video: "adrian-solo.webm", idImage: "adrian-id-front.png", skills: ["Lead Guitar", "Vocals"], genres: ["Rock", "Alternative Rock", "Indie Rock"] },
  { key: "miguel", name: "Miguel Santos", email: "miguel.santos@musikalokal.test", role: "musician", location: "Makati", image: "miguel-santos.png", cv: "miguel-santos.txt", video: "miguel-solo.webm", skills: ["Drums"], genres: ["Jazz", "Funk"] },
  { key: "andrea", name: "Andrea Cruz", email: "andrea.cruz@musikalokal.test", role: "musician", location: "Quezon City", image: "andrea-cruz.png", cv: "andrea-cruz.txt", skills: ["Lead Vocals", "Acoustic Guitar"], genres: ["Acoustic", "Pop", "Indie"] },
  { key: "paolo", name: "Paolo Mendoza", email: "paolo.mendoza@musikalokal.test", role: "musician", location: "Quezon City", image: "paolo-mendoza.png", cv: "paolo-mendoza.txt", skills: ["Lead Guitar", "Backing Vocals"], genres: ["Acoustic", "Pop", "Indie Rock"] },
  { key: "ethan", name: "Ethan Ramirez", email: "ethan.ramirez@musikalokal.test", role: "musician", location: "Quezon City", image: "ethan-ramirez.png", cv: "ethan-ramirez.txt", skills: ["Lead Vocals", "Rhythm Guitar"], genres: ["Alternative Rock", "Indie Rock", "Pop Rock"] },
  { key: "lucas", name: "Lucas Garcia", email: "lucas.garcia@musikalokal.test", role: "musician", location: "Quezon City", image: "lucas-garcia.png", cv: "lucas-garcia.txt", skills: ["Lead Guitar", "Backing Vocals"], genres: ["Alternative Rock", "Indie Rock", "Pop Rock"] },
  { key: "nathan", name: "Nathan Flores", email: "nathan.flores@musikalokal.test", role: "musician", location: "Quezon City", image: "nathan-flores.png", cv: "nathan-flores.txt", skills: ["Bass Guitar", "Drums"], genres: ["Alternative Rock", "Indie Rock", "Pop Rock"] },
];

export const groups = [
  { key: "northline", id: "91000000-0000-4000-8000-000000000001", name: "TEST - Northline Duo", type: "duo", owner: "andrea", image: "northline-duo.png", video: "northline-duo.webm", genre: "Acoustic, Pop, Indie Rock", members: [
    { user: "andrea", membership: "owner", role: "Lead Vocals", instrument: "Acoustic Guitar" },
    { user: "paolo", membership: "member", role: "Backing Vocals", instrument: "Lead Guitar" },
  ]},
  { key: "midnight", id: "91000000-0000-4000-8000-000000000002", name: "TEST - Midnight Avenue", type: "band", owner: "ethan", image: "midnight-avenue.png", video: "midnight-avenue.webm", genre: "Alternative Rock, Indie Rock, Pop Rock", members: [
    { user: "ethan", membership: "owner", role: "Lead Vocals", instrument: "Rhythm Guitar" },
    { user: "lucas", membership: "member", role: "Backing Vocals", instrument: "Lead Guitar" },
    { user: "nathan", membership: "member", role: "Drums", instrument: "Bass Guitar" },
  ]},
];

export const gig = {
  id: "92000000-0000-4000-8000-000000000001", name: "TEST - Friday Night Alternative Live",
  image: "friday-night-alternative-live.png", ...QC,
  requirements: {
    genres: ["Alternative Rock", "Indie Rock", "Rock"], instruments: ["Lead Guitar", "Vocals", "Bass Guitar"],
    experience_level: "Intermediate", musician_type: "Any", total_slots_needed: 3,
    slots: {
      solo: { needed: 1, roles: ["Lead Guitar"], preferred_genres: ["Alternative Rock", "Indie Rock"], preferred_instruments: ["Lead Guitar"], specific_requirements: [{ slot_id: "solo-1", label: "Solo Artist 1", roles: ["Lead Guitar"], preferred_genres: ["Alternative Rock", "Indie Rock"], preferred_instruments: ["Lead Guitar"] }] },
      duo: { needed: 1, roles: ["Vocalist", "Guitarist"], preferred_genres: ["Acoustic", "Pop"], preferred_instruments: ["Guitar"], specific_requirements: [{ slot_id: "duo-1", label: "Duo 1", members: [{ label: "Vocalist", roles: ["Vocalist"], preferred_instruments: [] }, { label: "Guitarist", roles: [], preferred_instruments: ["Guitar"] }] }] },
      band: { needed: 1, roles: ["Lead Vocals", "Lead Guitar", "Bass Guitar"], preferred_genres: ["Alternative Rock", "Indie Rock"], preferred_instruments: ["Guitar", "Bass"], preferred_group_types: ["band"], specific_requirements: [{ slot_id: "band-1", label: "Three-member band", group_type: "band", members: [{ label: "Lead vocals", roles: ["Lead Vocals"], preferred_instruments: [] }, { label: "Lead guitar", roles: [], preferred_instruments: ["Lead Guitar"] }, { label: "Bass guitar", roles: [], preferred_instruments: ["Bass Guitar"] }] }] },
    },
    ai_recommendation_settings: { enabled: true, location_radius_km: 25, criteria: { genres: "required", instruments: "required", location: "preferred", portfolio: "preferred" } },
  },
};

export const applicationIds = { adrian: "93000000-0000-4000-8000-000000000001", miguel: "93000000-0000-4000-8000-000000000002", northline: "93000000-0000-4000-8000-000000000003", midnight: "93000000-0000-4000-8000-000000000004" };
