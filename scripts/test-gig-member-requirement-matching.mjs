import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const matcherModules = [
  ["mobile", await import("../mobile/supabase/functions/_shared/gigMemberRequirementMatching.ts")],
  ["web", await import("../web/supabase/functions/_shared/gigMemberRequirementMatching.ts")],
];

const duoRequirement = [{
  slot_id: "duo-1",
  label: "Duo 1",
  group_type: "duo",
  members: [
    { label: "Member 1", roles: ["Vocalist"], preferred_instruments: [] },
    { label: "Member 2", roles: [], preferred_instruments: ["Guitar"] },
  ],
}];

for (const [target, { matchGigMemberRequirements, normalizeGigRosterMembers }] of matcherModules) {
  test(`${target}: one person cannot satisfy two configured member slots`, () => {
    const result = matchGigMemberRequirements(duoRequirement, [
      { user_id: "john", name: "John", role: "Vocalist", instrument: "Guitar" },
      { user_id: "mike", name: "Mike", role: "Keyboardist", instrument: "Keyboard" },
    ], "duo");

    assert.ok(result);
    assert.equal(result.matched_count, 1);
    assert.equal(result.total_count, 2);
    assert.equal(result.coverage_ratio, 0.5);
    assert.equal(result.members.filter((item) => item.member_name === "John").length, 1);
    assert.equal(result.members.filter((item) => item.status === "unmatched").length, 1);
  });

  test(`${target}: separate members satisfy separate configured slots`, () => {
    const result = matchGigMemberRequirements(duoRequirement, [
      { user_id: "jared", name: "Jared", role: "Lead Vocalist", instrument: "Acoustic Guitar" },
      { user_id: "alex", name: "Alex", role: "Lead Guitarist", instrument: "Electric Guitar" },
    ], "duo");

    assert.ok(result);
    assert.equal(result.matched_count, 2);
    assert.equal(result.coverage_ratio, 1);
    assert.deepEqual(result.members.map((item) => item.member_name), ["Jared", "Alex"]);
    assert.deepEqual(result.members[0].member_roles, ["Lead Vocalist"]);
    assert.deepEqual(result.members[1].member_instruments, ["Electric Guitar"]);
  });

  test(`${target}: the best configured slot is selected for one overall application score`, () => {
    const result = matchGigMemberRequirements([
      {
        slot_id: "band-keys",
        label: "Keys lineup",
        group_type: "band",
        members: [
          { label: "Keys", roles: ["Keyboardist"] },
          { label: "Drums", roles: ["Drummer"] },
        ],
      },
      {
        slot_id: "band-rock",
        label: "Rock lineup",
        group_type: "band",
        members: [
          { label: "Lead vocals", roles: ["Vocalist"] },
          { label: "Lead guitar", preferred_instruments: ["Guitar"] },
          { label: "Bass", preferred_instruments: ["Bass"] },
          { label: "Drums", preferred_instruments: ["Drums"] },
        ],
      },
    ], [
      { name: "Jared", role: "Lead Vocalist" },
      { name: "Alex", instrument: "Electric Guitar" },
      { name: "Mark", role: "Bassist" },
      { name: "Paul", role: "Drummer" },
    ], "band");

    assert.ok(result);
    assert.equal(result.slot_id, "band-rock");
    assert.equal(result.matched_count, 4);
    assert.deepEqual(result.members.map((item) => item.member_name), ["Jared", "Alex", "Mark", "Paul"]);
  });

  test(`${target}: a saved detailed group type narrows member-slot matching`, () => {
    const requirements = [
      {
        slot_id: "choir-slot",
        label: "Choir",
        group_type: "choir",
        members: [{ label: "Singer", roles: ["Vocalist"] }],
      },
      {
        slot_id: "opm-slot",
        label: "OPM band",
        group_type: "standard_opm_band",
        members: [{ label: "Singer", roles: ["Vocalist"] }],
      },
    ];
    const roster = [{ name: "Jared", role: "Lead Vocalist" }];

    assert.equal(matchGigMemberRequirements(requirements, roster, "standard_opm_band")?.slot_id, "opm-slot");
    assert.ok(matchGigMemberRequirements(requirements, roster, "band"));
  });

  test(`${target}: roster normalization keeps each member linked to roles and instruments`, () => {
    assert.deepEqual(normalizeGigRosterMembers([
      { user_id: "jared", name: "Jared", roles: ["Lead Vocalist"], instruments: ["Acoustic Guitar"] },
      { user_id: "alex", name: "Alex", roles: ["Lead Guitarist"], instruments: ["Electric Guitar"] },
    ]), [
      { member_id: "jared", member_name: "Jared", roles: ["Lead Vocalist"], instruments: ["Acoustic Guitar"] },
      { member_id: "alex", member_name: "Alex", roles: ["Lead Guitarist"], instruments: ["Electric Guitar"] },
    ]);
  });
}

for (const target of ["mobile", "web"]) {
  test(`${target}: Add and Edit Gig persist duo and band member requirements`, async () => {
    const [addGig, editGig, requirementEditor, normalizer] = await Promise.all([
      readFile(new URL(`../${target}/app/add_gig.tsx`, import.meta.url), "utf8"),
      readFile(new URL(`../${target}/app/edit_gig.tsx`, import.meta.url), "utf8"),
      readFile(new URL(`../${target}/src/components/GigSpecificSlotRequirements.tsx`, import.meta.url), "utf8"),
      readFile(new URL(`../${target}/src/utils/gigSlotRequirements.ts`, import.meta.url), "utf8"),
    ]);

    for (const screen of [addGig, editGig]) {
      assert.match(screen, /slotType="duo"/);
      assert.match(screen, /slotType="band"/);
      assert.match(screen, /normalizeSpecificSlotRequirements\(bandSpecificRequirements, bandSlotsNeeded, "band"\)/);
      assert.match(screen, /specific_requirements: normalizedBandRequirements/);
    }
    assert.match(requirementEditor, /Member-specific requirements/);
    assert.match(requirementEditor, /Add member requirement/);
    assert.match(normalizer, /slotType === "band" \? sourceMembers\.length/);
  });
}
