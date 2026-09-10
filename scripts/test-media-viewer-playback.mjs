import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const mobileViewer = readFileSync(
  new URL("../mobile/src/components/InAppMediaViewer.tsx", import.meta.url),
  "utf8",
);
const webViewer = readFileSync(
  new URL("../web/src/components/InAppMediaViewer.tsx", import.meta.url),
  "utf8",
);
const mobileFeed = readFileSync(
  new URL("../mobile/app/(tabs)/feed.tsx", import.meta.url),
  "utf8",
);

test("mobile video preview waits for user playback and pauses during cleanup", () => {
  assert.doesNotMatch(mobileViewer, /videoPlayer\.play\(\)/);
  assert.match(mobileViewer, /const player = useVideoPlayer\(uri\);/);
  assert.match(mobileViewer, /return \(\) => \{\s*player\.pause\(\);/);
});

test("web video preview does not autoplay and tears down playback when hidden", () => {
  assert.match(webViewer, /autoPlay: false/);
  assert.match(webViewer, /video\.pause\(\);\s*video\.removeAttribute\("src"\);\s*video\.load\(\);/);
  assert.match(webViewer, /if \(!visible \|\| !uri\) \{\s*return null;/);
});

test("handled feed fallback failures do not trigger Expo's console error overlay", () => {
  assert.doesNotMatch(mobileFeed, /console\.error\(`\[FeedInvokeError\]/);
  assert.match(mobileFeed, /console\.warn\(`\[FeedInvokeError\]/);
});
