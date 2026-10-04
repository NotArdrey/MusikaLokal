import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

for (const root of ["mobile", "web"]) {
  const policy = await import(`../${root}/src/utils/cvDocument.ts`);
  test(`${root}: CV pickers accept document types and reject media or misleading MIME types`, () => {
    assert.equal(policy.CV_DOCUMENT_MIME_TYPES.some((mime) => /^(image|video|audio)\//.test(mime)), false);
    for (const name of ["resume.PDF", "resume.doc", "resume.docx", "resume.odt", "resume.rtf", "resume.txt", "resume.md"]) {
      assert.doesNotThrow(() => policy.assertCvDocument({ name, mimeType: "application/octet-stream" }));
    }
    for (const name of ["resume.jpg", "resume.png", "resume.webp", "resume.mp4", "resume.mov", "resume.mp3", "resume.pdf.jpg", "resume"]) {
      assert.throws(() => policy.assertCvDocument({ name }), /Images and videos are not allowed/);
    }
    assert.throws(() => policy.assertCvDocument({ name: "resume.pdf", mimeType: "image/jpeg" }));
    assert.throws(() => policy.assertCvDocument({ name: "resume.docx", mimeType: "video/mp4" }));
  });
  test(`${root}: renamed media fails document signature checks`, () => {
    for (const bytes of [
      new Uint8Array([0xff, 0xd8, 0xff]),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
      new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
    ]) {
      for (const extension of ["pdf", "doc", "docx", "odt", "rtf", "txt", "md"]) {
        assert.throws(() => policy.assertCvDocumentContent(`resume.${extension}`, bytes));
      }
    }
    assert.doesNotThrow(() => policy.assertCvDocumentContent("resume.pdf", new TextEncoder().encode("%PDF-1.7\n")));
    assert.doesNotThrow(() => policy.assertCvDocumentContent("resume.docx", new Uint8Array([0x50, 0x4b, 3, 4])));
    assert.doesNotThrow(() => policy.assertCvDocumentContent("resume.txt", new TextEncoder().encode("Musician résumé: guitar and vocals")));
    assert.doesNotThrow(() => policy.assertCvDocumentContent("resume.rtf", new TextEncoder().encode("{\\rtf1 Resume}")));
  });
  test(`${root}: every CV upload entry point uses document validation`, () => {
    const read = (path) => readFileSync(new URL(`../${root}/${path}`, import.meta.url), "utf8");
    const picker = read("src/components/DocumentUploader.tsx");
    assert.match(picker, /type: CV_DOCUMENT_MIME_TYPES/);
    assert.match(picker, /assertCvDocument\(/);
    for (const path of ["src/hooks/useApplicationSubmissionAction.ts", "src/utils/listingRequests.ts"]) {
      assert.match(read(path), /assertCvDocument\(file\)/);
      assert.match(read(path), /documentOnly: true/);
    }
    if (root === "mobile") {
      assert.match(read("app/group_application_cv.tsx"), /documentOnly: true/);
    }
  });
}

test("database and storage enforce document-only CV submissions without blocking existing reviews", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema storage;
      create table storage.buckets (id text primary key, allowed_mime_types text[]);
      create table storage.objects (bucket_id text, name text, metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant all on storage.objects to authenticated;
      create policy "Existing upload access" on storage.objects for all to authenticated using (true) with check (true);
      insert into storage.buckets values ('application-cvs', null), ('documents', null);
      create table public.gig_applications (id integer primary key, cv_url text, status text);
      create table public.gig_application_members (id integer primary key, cv_storage_path text);
      create table public.booking_requests (id integer primary key, attachment_url text, event_details jsonb, status text);
      insert into public.gig_applications values (1, 'https://example.test/legacy.jpg', 'pending');
    `);
    await db.exec(readFileSync(new URL("../mobile/supabase/migrations/20261001100000_require_cv_document_uploads.sql", import.meta.url), "utf8"));
    await db.query("update public.gig_applications set status = 'accepted' where id = 1");
    for (const name of ["resume.jpg", "resume.png", "resume.mp4", "resume.pdf.jpg"]) {
      await assert.rejects(db.query("insert into public.gig_applications values (2, $1, 'pending')", [`https://example.test/${name}`]), /Images and videos are not allowed/);
      await assert.rejects(db.query("insert into public.gig_application_members values (2, $1)", [`owner/gig-applications/${name}`]), /Images and videos are not allowed/);
      await assert.rejects(db.query("insert into public.booking_requests values (2, $1, $2, 'pending')", [
        `https://example.test/${name}`, { request_details: { request_kind: "application", cv_url: `https://example.test/${name}` } },
      ]), /Images and videos are not allowed/);
    }
    await db.query("insert into public.gig_applications values (3, 'https://example.test/resume.pdf?token=signed', 'pending')");
    await db.exec("set role authenticated");
    await db.query("insert into storage.objects values ('documents', 'owner/cvs/resume.pdf', $1)", [{ mimetype: "application/pdf" }]);
    await db.query("insert into storage.objects values ('documents', 'owner/playlists/song.mp3', $1)", [{ mimetype: "audio/mpeg" }]);
    for (const [bucket, name, mime] of [
      ["documents", "owner/cvs/resume.jpg", "image/jpeg"],
      ["documents", "owner/applications/resume.mp4", "video/mp4"],
      ["documents", "owner/cvs/resume.pdf", "image/jpeg"],
      ["application-cvs", "owner/gig-applications/resume.png", "image/png"],
    ]) {
      await assert.rejects(db.query("insert into storage.objects values ($1, $2, $3)", [bucket, name, { mimetype: mime }]), /row-level security/);
    }
    await assert.rejects(db.query("update storage.objects set metadata = $1 where name = 'owner/cvs/resume.pdf'", [{ mimetype: "video/mp4" }]), /row-level security/);
  } finally {
    await db.close();
  }
});
