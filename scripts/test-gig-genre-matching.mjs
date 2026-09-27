import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadGenreHelpers(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports,
    console: { log() {}, warn() {}, error() {} },
    URL,
    fetch,
    FormData,
    Blob,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortSignal,
    Deno: { env: { get: () => undefined } },
    require: (specifier) => {
      throw new Error("Unexpected import while loading genre helpers");
    },
  });
  vm.runInContext(javascript, context);
  return exports;
}

for (const relativePath of [
  "../mobile/supabase/functions/_shared/gigPortfolioReview.ts",
  "../web/supabase/functions/_shared/gigPortfolioReview.ts",
]) {
  test(`${relativePath} detects CV formats from signatures before filenames`, () => {
    const helpers = loadGenreHelpers(relativePath);
    assert.equal(helpers.detectDocumentFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/octet-stream", "/resume.bin"), "pdf");
    assert.equal(helpers.detectDocumentFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), "application/octet-stream", "/resume.bin"), "doc");
    assert.equal(helpers.detectDocumentFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "application/octet-stream", "/resume.bin"), "image");
    assert.equal(helpers.detectDocumentFormat(new TextEncoder().encode("{\\rtf1 resume}"), "application/octet-stream", "/resume.bin"), "rtf");
    assert.equal(helpers.detectDocumentFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "application/vnd.oasis.opendocument.text", "/resume.bin"), "odt");
  });

  test(`${relativePath} rejects token text but accepts substantive CV text`, () => {
    const helpers = loadGenreHelpers(relativePath);
    assert.equal(helpers.hasUsableDocumentText("Resume Page 1"), false);
    assert.equal(helpers.hasUsableDocumentText("Jared Cariaso is a musician, vocalist, guitarist, and live performer with experience playing private events, local venues, acoustic sets, rehearsals, and community performances in Pampanga."), true);
  });

  test(`${relativePath} reads normal and drawing-layer text from Word XML`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const xml = '<w:document><w:body><w:p><w:r><w:t>Jared Cariaso</w:t></w:r></w:p><w:p><w:r><a:t>Lead vocalist and guitarist</a:t></w:r></w:p></w:body></w:document>';
    assert.equal(helpers.extractTextFromXml(xml, "docx"), "Jared Cariaso\nLead vocalist and guitarist");
  });

  test(`${relativePath} uses recognized ACRCloud genres as advisory genre evidence`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const evidence = helpers.buildRecognizedAudioGenreEvidence(
      [{ key: "genre_requirement", requirement: "Rock, Jazz" }],
      {
        copyright_title: "Fixture Song",
        copyright_artist_label: "Fixture Artist",
        copyright_score: 96,
        recognized_audio_genres: ["Alternative Rock", "OPM"],
        recognized_audio_genre_source: "acrcloud_catalog_metadata",
      },
    );

    assert.equal(evidence.result, "supported");
    assert.equal(evidence.confidence, 0.96);
    assert.equal(evidence.evidence[0].source, "recognized_audio");
    assert.match(evidence.evidence[0].observation, /matches the requested Rock genre/);
  });

  test(`${relativePath} records a clear mismatch when catalog genres differ`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const evidence = helpers.buildRecognizedAudioGenreEvidence(
      [{ key: "genre_requirement", requirement: "Jazz" }],
      { recognized_audio_genres: ["Alternative Rock"] },
    );
    assert.equal(evidence.result, "not_supported");
    assert.equal(evidence.evidence[0].source, "recognized_audio");
    assert.match(evidence.evidence[0].observation, /does not match the requested Jazz genre/);
  });

  test(`${relativePath} accepts only untampered signed genre evidence`, async () => {
    const helpers = loadGenreHelpers(relativePath);
    const userId = "00000000-0000-4000-8000-000000000001";
    const secret = "service-role-fixture";
    const metadata = {
      copyright_track_key: "isrc:PHABC2600001",
      copyright_score: 96,
      recognized_audio_genres: ["OPM", "Alternative Rock"],
      genre_evidence_receipt_version: 1,
      genre_evidence_user_id: userId,
    };
    const payload = JSON.stringify({
      version: 1,
      user_id: userId,
      track_key: metadata.copyright_track_key,
      score: metadata.copyright_score,
      genres: ["alternative rock", "opm"],
    });
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload),
    );
    metadata.genre_evidence_receipt = Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    assert.equal(await helpers.verifyGenreEvidenceReceipt(metadata, userId, secret), true);
    assert.equal(await helpers.verifyGenreEvidenceReceipt({ ...metadata, copyright_score: 50 }, userId, secret), false);
  });
}
