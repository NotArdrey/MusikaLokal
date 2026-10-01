import assert from "node:assert/strict";
import test from "node:test";

const modules = [
  ["web", await import("../web/supabase/functions/_shared/gigMemberVerification.ts")],
  ["mobile", await import("../mobile/supabase/functions/_shared/gigMemberVerification.ts")],
];

const member = (id, faceId = `face-${id}`) => ({
  member_id: id,
  external_image_id: `member_${id}`,
  reference_face_ids: faceId ? [faceId] : [],
});

const face = (id, similarity) => ({
  Similarity: similarity,
  Face: { FaceId: `face-${id}`, ExternalImageId: `member_${id}` },
});

const person = (index, timestamp, matches) => ({
  Timestamp: timestamp,
  Person: { Index: index },
  FaceMatches: matches,
});

for (const [target, api] of modules) {
  test(`${target}: external image IDs use UUID-safe opaque member identifiers`, () => {
    assert.equal(api.externalImageIdForMember("abc-123"), "member_abc-123");
    assert.equal(api.externalImageIdForMember("member with spaces"), "member_member_with_spaces");
    assert.throws(() => api.externalImageIdForMember(""));
  });

  test(`${target}: solo member is verified without changing any match score`, () => {
    const result = api.aggregateMemberFaceSearch([member("solo")], [person(0, 1200, [face("solo", 98.4)])]);
    assert.equal(result.result, "verified");
    assert.equal(result.verified_member_count, 1);
    assert.equal(result.members[0].best_similarity, 98.4);
    assert.equal("score" in result, false);
  });

  test(`${target}: solo no-match is advisory needs review`, () => {
    const result = api.aggregateMemberFaceSearch([member("solo")], [person(0, 1200, [])]);
    assert.equal(result.result, "needs_review");
    assert.equal(result.members[0].status, "needs_review");
  });

  test(`${target}: duo can verify two distinct tracked people`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a"), member("b")],
      [person(0, 100, [face("a", 98)]), person(1, 200, [face("b", 97)])],
    );
    assert.equal(result.result, "verified");
    assert.equal(result.verified_member_count, 2);
  });

  test(`${target}: duo 1 of 2 is partially verified`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a"), member("b")],
      [person(0, 100, [face("a", 98)])],
    );
    assert.equal(result.result, "partially_verified");
    assert.equal(result.verified_member_count, 1);
  });

  test(`${target}: band 3 of 3 is verified`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a"), member("b"), member("c")],
      [person(0, 100, [face("a", 98)]), person(1, 200, [face("b", 97)]), person(2, 300, [face("c", 96)])],
    );
    assert.equal(result.result, "verified");
    assert.equal(result.verified_member_count, 3);
  });

  test(`${target}: band 2 of 3 is partially verified`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a"), member("b"), member("c")],
      [person(0, 100, [face("a", 98)]), person(1, 200, [face("b", 97)])],
    );
    assert.equal(result.result, "partially_verified");
    assert.equal(result.verified_member_count, 2);
  });

  test(`${target}: solo profile must match the same tracked person as the government ID`, () => {
    const identity = api.aggregateMemberFaceSearch(
      [member("solo")],
      [person(3, 100, [face("solo", 99)])],
    );
    const profiles = api.correlateProfileFaceSearch(
      identity.members,
      [{ member_id: "solo", face_id: "profile-solo", reference_hash: "solo-profile" }],
      [person(4, 200, [{ Similarity: 98, Face: { FaceId: "profile-solo" } }])],
    );

    assert.equal(profiles[0].status, "mismatch");
    assert.equal(profiles[0].issue_code, "different_video_person");
  });

  test(`${target}: copied profile in a duo is assigned to the member whose ID owns that video person`, () => {
    const identity = api.aggregateMemberFaceSearch(
      [member("a"), member("b")],
      [person(10, 100, [face("a", 99)]), person(20, 200, [face("b", 99)])],
    );
    const profiles = api.correlateProfileFaceSearch(
      identity.members,
      [
        { member_id: "a", face_id: "profile-a", reference_hash: "same-image-hash" },
        { member_id: "b", face_id: "profile-b", reference_hash: "same-image-hash" },
      ],
      [person(10, 300, [{ Similarity: 98.5, Face: { FaceId: "profile-a" } }])],
    );

    assert.equal(profiles.find((item) => item.member_id === "a").status, "verified");
    assert.equal(profiles.find((item) => item.member_id === "b").status, "mismatch");
    assert.equal(profiles.find((item) => item.member_id === "b").issue_code, "matches_another_member");
  });

  test(`${target}: every member in a larger group is independently correlated to their ID person`, () => {
    const identity = api.aggregateMemberFaceSearch(
      [member("a"), member("b"), member("c")],
      [person(1, 100, [face("a", 99)]), person(2, 200, [face("b", 98)]), person(3, 300, [face("c", 97)])],
    );
    const profiles = api.correlateProfileFaceSearch(
      identity.members,
      [
        { member_id: "a", face_id: "profile-a", reference_hash: "hash-a" },
        { member_id: "b", face_id: "profile-b", reference_hash: "hash-b" },
        { member_id: "c", face_id: "profile-c", reference_hash: "hash-c" },
      ],
      [
        person(1, 400, [{ Similarity: 96, Face: { FaceId: "profile-a" } }]),
        person(2, 500, [{ Similarity: 97, Face: { FaceId: "profile-b" } }]),
        person(3, 600, [{ Similarity: 98, Face: { FaceId: "profile-c" } }]),
      ],
    );

    assert.deepEqual(profiles.map((item) => item.status), ["verified", "verified", "verified"]);
    assert.deepEqual(profiles.map((item) => item.matched_person_indexes), [[1], [2], [3]]);
  });

  test(`${target}: one Person.Index cannot verify two roster members across timestamps`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a"), member("b")],
      [person(7, 100, [face("a", 96)]), person(7, 200, [face("b", 99)])],
    );
    assert.equal(result.verified_member_count, 1);
    assert.equal(result.members.find((item) => item.member_id === "b").status, "verified");
    assert.equal(result.members.find((item) => item.member_id === "a").status, "needs_review");
  });

  test(`${target}: repeated events at one timestamp are deduplicated`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a")],
      [person(0, 100, [face("a", 96)]), person(0, 100, [face("a", 99)]), person(0, 200, [face("a", 97)])],
    );
    assert.equal(result.members[0].match_count, 2);
    assert.equal(result.members[0].best_similarity, 99);
    assert.equal(result.members[0].best_match_timestamp_ms, 100);
    assert.equal(result.members[0].first_match_timestamp_ms, 100);
  });

  test(`${target}: an extra non-roster person cannot substitute for a roster member`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a"), member("b")],
      [person(0, 100, [face("a", 98)]), person(1, 200, [face("outside", 99)])],
    );
    assert.equal(result.verified_member_count, 1);
    assert.equal(result.additional_people_detected, true);
    assert.equal(result.members.find((item) => item.member_id === "b").status, "needs_review");
  });

  test(`${target}: ambiguous same-person member candidates do not verify either member`, () => {
    const result = api.aggregateMemberFaceSearch(
      [member("a"), member("b")],
      [person(4, 100, [face("a", 98.4), face("b", 98)])],
    );
    assert.equal(result.verified_member_count, 0);
    assert.deepEqual(result.ambiguous_person_indexes, [4]);
  });

  test(`${target}: configured threshold filters lower similarities while absent threshold accepts AWS-returned matches`, () => {
    const matches = [person(0, 100, [face("a", 94)])];
    assert.equal(api.aggregateMemberFaceSearch([member("a")], matches).verified_member_count, 1);
    assert.equal(api.aggregateMemberFaceSearch([member("a")], matches, { threshold: 95 }).verified_member_count, 0);
  });

  test(`${target}: members without an indexed reference are reported separately`, () => {
    const result = api.aggregateMemberFaceSearch([member("a", null)], []);
    assert.equal(result.result, "no_reference");
    assert.equal(result.members[0].status, "no_reference");
  });

  test(`${target}: an unusable verified-ID portrait is distinct from a missing portrait`, () => {
    const unusable = { ...member("a", null), reference_status: "reference_unusable" };
    const result = api.aggregateMemberFaceSearch([unusable], []);
    assert.equal(result.result, "needs_review");
    assert.equal(result.members[0].status, "reference_unusable");
  });

  test(`${target}: deterministic ClientRequestToken is stable, bounded, and changes with inputs`, async () => {
    const input = { application_id: "app", video_version: "video-v1", roster_version: "roster-v1" };
    const first = await api.buildFaceSearchClientRequestToken(input);
    const second = await api.buildFaceSearchClientRequestToken(input);
    const changed = await api.buildFaceSearchClientRequestToken({ ...input, video_version: "video-v2" });
    assert.equal(first, second);
    assert.notEqual(first, changed);
    assert.match(first, /^[a-f0-9]{64}$/);
  });

  test(`${target}: only an ISO BMFF container carrying H.264 is accepted`, () => {
    const supported = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0x61, 0x76, 0x63, 0x31]);
    const wrongCodec = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0x68, 0x65, 0x76, 0x31]);
    const wrongContainer = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x61, 0x76, 0x63, 0x31]);
    assert.equal(api.inspectRekognitionVideo(supported).supported, true);
    assert.equal(api.inspectRekognitionVideo(wrongCodec).reason, "unsupported_video_codec");
    assert.equal(api.inspectRekognitionVideo(wrongContainer).reason, "unsupported_container");
  });
}
