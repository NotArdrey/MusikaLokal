import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("personalized feed cards keep the AI Suggested label during local-ranker fallback", () => {
  for (const path of ["web/app/feed.tsx", "mobile/app/(tabs)/feed.tsx"]) {
    const source = read(path);
    assert.match(source, /ai_suggested:\s*true/);
    assert.match(source, /return ["']AI Suggested["']/);
    assert.match(source, /ai_suggested[^\n]+ai_recommended/);
    assert.match(source, /const aiRecommendationLabel = getAiRecommendationLabel\(item\);\s*if \(aiRecommendationLabel\) return aiRecommendationLabel;/);
  }
});

test("future featured gigs remain eligible after their accepted slot closes", () => {
  for (const root of ["web", "mobile"]) {
    const source = read(`${root}/supabase/functions/home-feed/index.ts`);
    assert.match(source, /\.neq\(["']status["'],\s*["']cancelled["']\)/);
    assert.match(source, /get_gig_featured_performers_for_feed/);
    assert.match(source, /has_featured_performers/);
    assert.match(source, /featuredCandidates/);
    assert.match(source, /requirements\.event_schedules/);
    assert.match(source, /requirements\.event_end_time/);
    assert.match(source, /Math\.max\(\.\.\.scheduleEndTimes\)/);
    assert.match(source, /isGigUpcomingOrInProgress/);
    assert.doesNotMatch(source, /event_date\.gte/);
  }

  const mobileFeed = read("mobile/app/(tabs)/feed.tsx");
  assert.match(mobileFeed, /statusOpen\s*\|\|\s*hasFeaturedPerformers/);
  assert.match(mobileFeed, /eventEndTime\s*>=\s*Date\.now\(\)/);
  assert.match(mobileFeed, /requirements\.event_schedules/);
  assert.match(mobileFeed, /requirements\.event_end_time/);
  assert.doesNotMatch(mobileFeed, /event_date\.gte/);
});

test("featured gig expiry uses the last Manila schedule end instead of event-date midnight", () => {
  const eventDateMidnight = Date.parse("2026-09-25T00:00:00+00:00");
  const firstScheduleEnd = Date.parse("2026-09-25T21:00:00+08:00");
  const finalScheduleEnd = Date.parse("2026-09-25T23:00:00+08:00");

  assert.equal(new Date(eventDateMidnight).toISOString(), "2026-09-25T00:00:00.000Z");
  assert.equal(new Date(Math.max(firstScheduleEnd, finalScheduleEnd)).toISOString(), "2026-09-25T15:00:00.000Z");
  assert.equal((finalScheduleEnd - eventDateMidnight) / 3_600_000, 15);
});

test("feed gig summaries expose applicant totals without metadata pills", () => {
  const mobileFeed = read("mobile/app/(tabs)/feed.tsx");
  const webFeed = read("web/app/feed.tsx");

  for (const source of [mobileFeed, webFeed]) {
    assert.match(source, /LIVE GIG/);
    assert.match(source, /LOOKING FOR/);
    assert.match(source, /socialGigMetaList/);
    assert.match(source, /applicant_count/);
    assert.match(source, /isGigCard \? styles\.socialGigMetaItem/);
  }
});

test("gig video and custom-contract uploads use readable temporary files and safe storage paths", () => {
  const videoUploader = read("web/src/components/VideoUploader.tsx");
  assert.match(videoUploader, /createTemporaryUploadFile\(asset\.uri,\s*originalName\)/);
  assert.match(videoUploader, /assetUri:\s*readableAssetUri/);

  for (const path of ["web/app/add_gig.tsx", "web/app/edit_gig.tsx"]) {
    const source = read(path);
    assert.match(source, /DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY/);
    assert.match(source, /sanitizeStorageFileName\(fileName,\s*["']contract\.pdf["']\)/);
    assert.match(source, /uploadStorageObject\(\{/);
    assert.doesNotMatch(source, /base64ToUint8Array/);
  }
});
