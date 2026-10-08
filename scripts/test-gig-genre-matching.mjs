import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as cvApplicantName from "../mobile/supabase/functions/_shared/cvApplicantName.ts";

function loadGenreHelpers(relativePath, fetchOverride = fetch) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const javascript = ts.transpileModule(`${source}\nexport { reviewVideoWithGemini };`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports,
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL,
    fetch: fetchOverride,
    Response,
    FormData,
    Blob,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortSignal,
    Deno: { env: { get: () => undefined } },
    require: (specifier) => {
      if (specifier.endsWith("cvApplicantName.ts")) return cvApplicantName;
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
  test(`${relativePath} requires observed genre evidence and timestamped vocal cues`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const safe = helpers.sanitizeVideoPerformanceDetails({
      performance_visible: true, singing_present: true,
      detected_genres: [
        { genre: "Rock", confidence: 0.93, observation: "Distorted guitars and a rock drum pattern", timestamp_seconds: 5 },
        { genre: "Jazz", confidence: 0.2, observation: "Possible swing", timestamp_seconds: 8 },
        { genre: "Pop", confidence: 0.99, observation: "" },
      ],
      vocal_performance: { status: "supported", confidence: 0.94, short_reason: "Visible mouth movements appear consistent with the vocal phrases.", evidence: [{ observation: "Mouth opens at the start of the audible phrase", timestamp_seconds: 5 }] },
    });
    assert.equal(safe.detected_genres.length, 1);
    assert.equal(safe.detected_genres[0].genre, "Rock");
    assert.equal(safe.vocal_performance.status, "supported");
    assert.match(safe.vocal_performance.limitations[0], /cannot prove live singing/);
    for (const override of [
      { singing_present: null }, { performance_visible: false },
      { singing_present: false, vocal_performance: { status: "not_supported", confidence: 0.99, evidence: [{ observation: "Instrumental video", timestamp_seconds: 5 }] } },
      { vocal_performance: { status: "supported", confidence: 0.99, evidence: [] } },
      { vocal_performance: { status: "supported", confidence: 0.2, evidence: [{ observation: "Uncertain", timestamp_seconds: 2 }] } },
      { vocal_performance: { status: "supported", confidence: 0.99, evidence: [{ observation: "Unknown time", timestamp_seconds: null }] } },
    ]) {
      const checked = helpers.sanitizeVideoPerformanceDetails({ ...safe, performance_visible: true, singing_present: true, ...override });
      assert.equal(checked.vocal_performance.status, "unclear");
    }
    const empty = helpers.sanitizeVideoPerformanceDetails(null);
    assert.equal(empty.detected_genres.length, 0);
    assert.equal(empty.vocal_performance.status, "unclear");
  });

  test(`${relativePath} submits the complete video and retains genre and vocal results`, async () => {
    const mediaUrl = "https://fixture.supabase.co/storage/v1/object/sign/videos/performance.mp4";
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = {
      performance_visible: true, performer_count: 1, visible_instruments: ["Guitar"], singing_present: true,
      performance_evidence: "supported", observations: ["A vocalist plays guitar"],
      detected_genres: [{ genre: "Rock", confidence: 0.9, observation: "Rock rhythm and guitar arrangement", timestamp_seconds: 5 }],
      vocal_performance: { status: "supported", confidence: 0.92, short_reason: "Audible phrases appear consistent with visible singing.", evidence: [{ observation: "Visible singing starts with the audible phrase", timestamp_seconds: 5 }], limitations: [] },
      criterion_findings: [{ criterion: "genre_requirement", status: "supported", source: "performance_video", confidence: 0.9, short_reason: "Rock arrangement heard", evidence: [{ source: "performance_video", observation: "Rock rhythm and guitar arrangement", timestamp_seconds: 5 }], limitations: [] }],
    };
    let generated = false, deleted = false;
    const helpers = loadGenreHelpers(relativePath, async (url, options = {}) => {
      if (url === mediaUrl) return new Response(bytes, { headers: { "content-type": "video/mp4" } });
      if (String(url).endsWith("/upload/v1beta/files")) return new Response("{}", { headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/fixture-upload" } });
      if (String(url).endsWith("/fixture-upload")) {
        assert.deepEqual(new Uint8Array(await options.body.arrayBuffer()), bytes);
        return Response.json({ file: { name: "files/fixture", uri: "https://generativelanguage.googleapis.com/v1beta/files/fixture", state: "ACTIVE" } });
      }
      if (String(url).includes(":generateContent")) {
        const payload = JSON.parse(options.body);
        assert.equal(payload.contents[0].parts[1].fileData.mimeType, "video/mp4");
        assert.ok(payload.contents[0].parts[1].fileData.fileUri);
        assert.match(payload.systemInstruction.parts[0].text, /both its audio and visual streams/);
        assert.match(payload.systemInstruction.parts[0].text, /cannot prove live singing/);
        assert.ok(payload.generationConfig.responseJsonSchema.required.includes("detected_genres"));
        assert.ok(payload.generationConfig.responseJsonSchema.required.includes("vocal_performance"));
        generated = true;
        return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(result) }] } }] });
      }
      if (options.method === "DELETE") { deleted = true; return new Response(null, { status: 204 }); }
      throw new Error(`Unexpected request: ${url}`);
    });
    const reviewed = await helpers.reviewVideoWithGemini(mediaUrl, "https://fixture.supabase.co", [{ key: "genre_requirement", requirement: "Rock" }], "fixture-key", "gemini-3.5-flash-lite", "fixture-app");
    assert.equal(reviewed.processing_status, "reviewed");
    assert.equal(reviewed.structured_output.detected_genres[0].genre, "Rock");
    assert.equal(reviewed.structured_output.vocal_performance.status, "supported");
    assert.equal(generated, true);
    assert.equal(deleted, true);
  });

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

  test(`${relativePath} requires sourced evidence for supported findings`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const [finding] = helpers.sanitizeReviewEvidence(
      [{ criterion: "portfolio_requirement", status: "supported", source: "cv", evidence: [], short_reason: "Experience was found." }],
      [{ key: "portfolio_requirement", requirement: "Relevant performance experience" }],
    );
    assert.equal(finding.result, "unclear");
  });

  test(`${relativePath} separates submitted performance evidence from CV experience`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const criteria = [
      { key: "portfolio_requirement", requirement: "Direct performance evidence submitted with this application" },
      { key: "performance_experience", requirement: "Documented live or professional performance experience" },
    ];
    const findings = helpers.sanitizeReviewEvidence(
      [
        {
          criterion: "portfolio_requirement",
          status: "supported",
          source: "cv",
          evidence: [{ source: "cv", observation: "Performance videos and recordings are available upon request." }],
          short_reason: "Portfolio materials are mentioned.",
        },
        {
          criterion: "performance_experience",
          status: "supported",
          source: "cv",
          evidence: [{ source: "cv", observation: "Freelance Musician / Live Performer | 2024-Present; performs live events and solo acoustic sets." }],
          short_reason: "The CV contains concrete live-performance history.",
        },
      ],
      criteria,
    );

    assert.equal(findings[0].result, "unclear");
    assert.equal(findings[0].evidence.length, 0);
    assert.equal(findings[1].result, "supported");
  });

  test(`${relativePath} does not mistake portfolio availability for performance experience`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const [finding] = helpers.sanitizeReviewEvidence(
      [{
        criterion: "performance_experience",
        status: "supported",
        source: "cv",
        evidence: [{ source: "cv", observation: "Performance videos, recordings, and additional portfolio materials available upon request." }],
        short_reason: "The CV offers portfolio materials.",
      }],
      [{ key: "performance_experience", requirement: "Documented live or professional performance experience" }],
    );

    assert.equal(finding.result, "unclear");
    assert.match(finding.short_reason, /does not itself confirm performance experience/i);
  });

  test(`${relativePath} keeps submitted media separate from transcript quality`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const finding = helpers.normalizeSubmittedPerformanceEvidence(
      {
        criterion: "portfolio_requirement",
        result: "unclear",
        confidence: 0.2,
        source: "video_transcript",
        short_reason: "No direct performance video or recording submitted.",
        evidence: [{ source: "video_transcript", observation: "Permanent voice.", timestamp_seconds: null }],
        limitations: [],
      },
      {
        mediaSubmitted: true,
        transcript: "Permanent voice.",
        framesReviewed: 0,
        recognizedAudioAvailable: false,
      },
    );

    assert.equal(finding.result, "unclear");
    assert.equal(finding.source, "performance_video");
    assert.match(finding.short_reason, /performance video was submitted/i);
    assert.doesNotMatch(finding.short_reason, /no .*submitted/i);
    assert.equal(finding.evidence[0].source, "performance_video");
    assert.doesNotMatch(finding.evidence.map((entry) => entry.observation).join(" "), /Permanent voice/i);
  });

  test(`${relativePath} says no video only when the application has no video record`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const finding = helpers.normalizeSubmittedPerformanceEvidence(undefined, {
      mediaSubmitted: false,
      transcript: "",
      framesReviewed: 0,
      recognizedAudioAvailable: false,
    });

    assert.equal(finding.result, "unclear");
    assert.equal(finding.short_reason, "No performance video was submitted.");
    assert.equal(finding.evidence.length, 0);
  });

  test(`${relativePath} can confirm submitted media from useful reviewed content`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const finding = helpers.normalizeSubmittedPerformanceEvidence(
      {
        criterion: "portfolio_requirement",
        result: "supported",
        confidence: 0.9,
        source: "video_frame",
        short_reason: "A musician is visibly performing.",
        evidence: [{ source: "video_frame", observation: "The sampled frame shows a musician performing with a guitar on stage.", timestamp_seconds: 1 }],
        limitations: [],
      },
      {
        mediaSubmitted: true,
        transcript: "",
        framesReviewed: 1,
        recognizedAudioAvailable: false,
      },
    );

    assert.equal(finding.result, "supported");
    assert.match(finding.short_reason, /contains direct performance evidence/i);
  });

  test(`${relativePath} does not use ACRCloud recognition alone as proof of a performance`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const finding = helpers.normalizeSubmittedPerformanceEvidence(
      {
        criterion: "portfolio_requirement",
        result: "supported",
        confidence: 0.96,
        source: "recognized_audio",
        short_reason: "A catalog song was recognized.",
        evidence: [{ source: "recognized_audio", observation: "The recording matches a catalog song tagged as Jazz.", timestamp_seconds: null }],
        limitations: [],
      },
      { mediaSubmitted: true, transcript: "", framesReviewed: 0, recognizedAudioAvailable: true },
    );
    assert.equal(finding.result, "unclear");
  });

  test(`${relativePath} downgrades unsupported findings when returned evidence supports the criterion`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const [finding] = helpers.sanitizeReviewEvidence(
      [{
        criterion: "portfolio_requirement",
        status: "not_supported",
        source: "cv",
        evidence: [{ source: "cv", observation: "Freelance musician and live performer for private events." }],
        short_reason: "Relevant experience was not found.",
      }],
      [{ key: "portfolio_requirement", requirement: "Relevant performance experience" }],
    );
    assert.equal(finding.result, "unclear");
  });

  test(`${relativePath} treats missing wording as unclear rather than not supported`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const [finding] = helpers.sanitizeReviewEvidence(
      [{
        criterion: "instrument_requirement",
        status: "not_supported",
        source: "cv",
        evidence: [{ source: "cv", observation: "The CV does not mention the requested instrument." }],
        short_reason: "The requested instrument was not found in the CV.",
      }],
      [{ key: "instrument_requirement", requirement: "Guitar" }],
    );
    assert.equal(finding.result, "unclear");
  });

  test(`${relativePath} keeps explicit source contradictions as not supported`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const [finding] = helpers.sanitizeReviewEvidence(
      [{
        criterion: "genre_requirement",
        status: "not_supported",
        source: "recognized_audio",
        evidence: [{ source: "recognized_audio", observation: "The catalog lists Classical only, which does not match the requested Jazz genre." }],
        short_reason: "The identified recording has a different catalog genre.",
      }],
      [{ key: "genre_requirement", requirement: "Jazz" }],
    );
    assert.equal(finding.result, "not_supported");
  });

  test(`${relativePath} does not treat a CV address as a preferred gig location`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const [finding] = helpers.sanitizeReviewEvidence(
      [{
        criterion: "location_requirement",
        status: "supported",
        source: "cv",
        evidence: [{ source: "cv", observation: "Pampanga, Philippines" }],
        short_reason: "The CV lists Pampanga as the applicant's address.",
      }],
      [{ key: "location_requirement", requirement: "Makati" }],
    );
    assert.equal(finding.result, "unclear");
    assert.match(finding.short_reason, /does not clearly state preferred gig locations/i);
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

  test(`${relativePath} matches the Jared CV regression evidence without fabricating bass or Jazz`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const findings = helpers.sanitizeReviewEvidence(
      [
        {
          criterion: "instrument_requirement",
          status: "unclear",
          source: "cv",
          evidence: [{ source: "cv", observation: "Primary skills: vocals, acoustic guitar, electric guitar." }],
          short_reason: "Bass is not listed in the CV.",
          confidence: 0.92,
        },
        {
          criterion: "genre_requirement",
          status: "unclear",
          source: "cv",
          evidence: [{ source: "cv", observation: "Genres: Pop, Rock / Alternative, Acoustic, Indie, OPM / Pop Rock." }],
          short_reason: "Jazz is not listed in the CV.",
          confidence: 0.93,
        },
        {
          criterion: "performance_experience",
          status: "supported",
          source: "cv",
          evidence: [{ source: "cv", observation: "Freelance Musician / Live Performer | 2024-Present; performs live music for private events, local venues, school activities, community events, and solo acoustic sets." }],
          short_reason: "The CV lists concrete live-performance history.",
          confidence: 0.98,
        },
      ],
      [
        { key: "instrument_requirement", requirement: "Bass" },
        { key: "genre_requirement", requirement: "Jazz" },
        { key: "performance_experience", requirement: "Documented live performance experience" },
      ],
    );

    assert.equal(findings.find((item) => item.criterion === "instrument_requirement").result, "unclear");
    assert.equal(findings.find((item) => item.criterion === "genre_requirement").result, "unclear");
    assert.equal(findings.find((item) => item.criterion === "performance_experience").result, "supported");
    const nameCheck = helpers.compareCvApplicantName("JARED CARIASO", ["Neil Ardrey Laza"], 0.99);
    assert.equal(nameCheck.status, "mismatch");
  });

  test(`${relativePath} accepts direct-video evidence without a transcript`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const finding = helpers.normalizeSubmittedPerformanceEvidence(
      {
        criterion: "portfolio_requirement",
        result: "supported",
        confidence: 0.95,
        source: "performance_video",
        short_reason: "A musical performance is present.",
        evidence: [{ source: "performance_video", observation: "A performer is visibly playing guitar while another performer sings.", timestamp_seconds: null }],
        limitations: [],
      },
      { mediaSubmitted: true, transcript: "Permanent voice", framesReviewed: 0, recognizedAudioAvailable: false },
    );
    assert.equal(finding.result, "supported");
    assert.equal(finding.source, "performance_video");
  });

  test(`${relativePath} preserves a reviewed video that clearly contains no performance`, () => {
    const helpers = loadGenreHelpers(relativePath);
    const [finding] = helpers.sanitizeReviewEvidence(
      [{
        criterion: "portfolio_requirement",
        status: "not_supported",
        source: "performance_video",
        evidence: [{ source: "performance_video", observation: "The video contains conversation without any musical performance.", timestamp_seconds: 0 }],
        short_reason: "No direct musical performance evidence exists in the video.",
        confidence: 0.98,
        limitations: [],
      }],
      [{ key: "portfolio_requirement", requirement: "Direct performance evidence" }],
    );
    assert.equal(finding.result, "not_supported");
  });

  test(`${relativePath} escalates unclear and internally unsupported findings`, () => {
    const helpers = loadGenreHelpers(relativePath);
    assert.equal(helpers.findingsNeedFallback([{ status: "unclear", evidence: [] }]), true);
    assert.equal(helpers.findingsNeedFallback([{
      status: "not_supported",
      short_reason: "Bass was not found.",
      evidence: [{ observation: "The CV lists guitar and vocals." }],
    }]), true);
    assert.equal(helpers.findingsNeedFallback([{
      status: "supported",
      short_reason: "Live performance history is listed.",
      evidence: [{ observation: "Freelance Musician / Live Performer | 2024-Present" }],
    }]), false);
  });

  test(`${relativePath} rejects malformed structured output without throwing`, () => {
    const helpers = loadGenreHelpers(relativePath);
    assert.equal(helpers.parseJsonContent("not-json"), null);
    assert.equal(JSON.stringify(helpers.parseJsonContent("```json\n{\"status\":\"ok\"}\n```")), '{"status":"ok"}');
  });

  test(`${relativePath} keeps ACRCloud no-match as no evidence`, () => {
    const helpers = loadGenreHelpers(relativePath);
    assert.equal(
      helpers.buildRecognizedAudioGenreEvidence([{ key: "genre_requirement", requirement: "Jazz" }], {}),
      null,
    );
  });
}
