import assert from "node:assert/strict";
import test from "node:test";

import { optimizeSupabaseImageUrl as optimizeMobileImageUrl } from "../mobile/src/utils/imageOptimization.ts";
import { optimizeSupabaseImageUrl as optimizeWebImageUrl } from "../web/src/utils/imageOptimization.ts";

const publicUrl =
  "https://example.supabase.co/storage/v1/object/public/avatars/user/photo.jpg";

for (const [client, optimizeImageUrl] of [
  ["web", optimizeWebImageUrl],
  ["mobile", optimizeMobileImageUrl],
]) {
  test(`${client}: direct delivery is the default`, () => {
    assert.equal(optimizeImageUrl(publicUrl), publicUrl);
  });

  test(`${client}: transform=false keeps the public object URL`, () => {
    assert.equal(
      optimizeImageUrl(publicUrl, {
        transform: false,
        quality: 72,
        resize: "cover",
        format: "origin",
      }),
      publicUrl,
    );
  });

  test(`${client}: transform=true opts into the render endpoint`, () => {
    const result = optimizeImageUrl(publicUrl, {
      transform: true,
      width: 300,
      height: 300,
      quality: 72,
      resize: "cover",
      format: "origin",
    });

    assert.ok(result);
    assert.match(result, /\/storage\/v1\/render\/image\/public\//);

    const parsed = new URL(result);
    assert.equal(parsed.searchParams.get("width"), "300");
    assert.equal(parsed.searchParams.get("height"), "300");
    assert.equal(parsed.searchParams.get("quality"), "72");
  });

  test(`${client}: cache busting does not enable transformations`, () => {
    const result = optimizeImageUrl(publicUrl, { cacheVersion: "cache_key_alpha" });

    assert.ok(result);
    assert.match(result, /\/storage\/v1\/object\/public\//);
    assert.equal(new URL(result).searchParams.get("v"), "cache_key_alpha");
  });
}
