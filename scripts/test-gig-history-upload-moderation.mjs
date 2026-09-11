import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
after(() => db.close());
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = uid(1),
  applicant = uid(2),
  other = uid(3),
  admin = uid(4),
  member = uid(5);
const gig = uid(10),
  emptyGig = uid(11),
  group = uid(12),
  app = uid(20);
const caseA = uid(30),
  caseB = uid(31),
  caseC = uid(32);
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table public.profiles(id uuid primary key, role text, full_name text, email text, avatar_url text);
  grant select on public.profiles to authenticated, service_role;
  create table public.groups(id uuid primary key, owner_id uuid, name text);
  create table public.group_members(group_id uuid,user_id uuid);
  create table public.production_team_roster(id uuid primary key, profile_id uuid, group_id uuid);
  create table public.gigs(id uuid primary key, organizer_id uuid, name text, event_date timestamptz, created_at timestamptz default now(), status text, location text);
  create table public.gig_applications(id uuid primary key, gig_id uuid, applicant_id uuid, submitted_by_user_id uuid, group_id uuid, production_team_id uuid, production_roster_id uuid, status text, created_at timestamptz default now(), cv_url text, pitch_message text);
  create function public.staff_can_edit_gig(uuid,uuid) returns boolean language sql stable as $$ select false $$;
  create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,meta jsonb);
  create table public.feed_posts(id uuid primary key default gen_random_uuid(),author_id uuid,content text);
  alter table public.feed_posts enable row level security;
  grant select,insert,update,delete on public.feed_posts to authenticated,service_role;
  create policy feed_posts_select on public.feed_posts for select to authenticated using(true);
  create policy feed_posts_insert on public.feed_posts for insert to authenticated with check(author_id=auth.uid());
  create policy feed_posts_update on public.feed_posts for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
  create policy legacy_broad_access on storage.objects for all to anon,authenticated using(true) with check(true);
  insert into public.profiles(id,role,full_name) values
    ('${owner}','venue-owner','Owner'),('${applicant}','musician','Solo'),('${other}','musician','Other'),('${admin}','admin','Admin'),('${member}','musician','Member');
  insert into public.groups values('${group}','${other}','Group');
  insert into public.group_members values('${group}','${member}');
  insert into public.gigs(id,organizer_id,name,status) values('${gig}','${owner}','Past Gig','closed'),('${emptyGig}','${owner}','Empty Gig','open');
  insert into public.gig_applications(id,gig_id,applicant_id,status,cv_url,pitch_message) values
    ('${app}','${gig}','${applicant}','declined','private-cv','private-pitch');
  insert into public.gig_applications(id,gig_id,applicant_id,group_id,status) values('${uid(21)}','${gig}','${other}','${group}','cancelled');
`);
await db.exec(
  readFileSync(
    new URL(
      "../mobile/supabase/migrations/20260430030000_add_read_only_gig_application_visibility.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const migration = readFileSync(
  new URL(
    "../mobile/supabase/migrations/20260907180546_gig_history_and_upload_moderation.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.equal(
  migration.replace(/\r\n/g, "\n"),
  readFileSync(
    new URL(
      "../web/supabase/migrations/20260907180546_gig_history_and_upload_moderation.sql",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\r\n/g, "\n"),
);
await db.exec(migration);
const scopedRestrictionsMigration = readFileSync(
  new URL(
    "../mobile/supabase/migrations/20260911120000_add_scoped_content_restrictions.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.equal(
  scopedRestrictionsMigration.replace(/\r\n/g, "\n"),
  readFileSync(
    new URL(
      "../web/supabase/migrations/20260911120000_add_scoped_content_restrictions.sql",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\r\n/g, "\n"),
);
await db.exec(scopedRestrictionsMigration);

async function asUser(user, sql, params = [], role = "authenticated") {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user || "",
    ]);
    return await db.query(sql, params);
  } finally {
    await db.exec("rollback");
  }
}
const history = async (user) =>
  (await asUser(user, "select public.fetch_gig_history() as gigs")).rows[0]
    .gigs;
const review = (
  id,
  action,
  version,
  actor = admin,
  notes = "Reviewed original evidence",
) =>
  db.query(
    "select * from public.review_upload_moderation_case($1,$2,$3,$4,$5)",
    [id, actor, action, notes, version],
  );

test("gig owners see all posted gigs, including zero applicants and terminal statuses", async () => {
  const result = await history(owner);
  assert.equal(result.length, 2);
  assert.equal(
    result.find((item) => item.id === emptyGig).applicants.length,
    0,
  );
  assert.deepEqual(
    result
      .find((item) => item.id === gig)
      .applicants.map((item) => item.status),
    ["declined", "cancelled"],
  );
});
test("solo applicants and group members see every applicant only in associated gigs", async () => {
  for (const user of [applicant, member]) {
    const result = await history(user);
    assert.equal(result.length, 1);
    assert.equal(result[0].applicants.length, 2);
    assert.equal(result[0].is_owner, false);
    assert.equal(result[0].applicants.filter((item) => item.is_self).length, 1);
    assert.ok(!JSON.stringify(result).includes("private-cv"));
    assert.ok(!JSON.stringify(result).includes("private-pitch"));
  }
  assert.deepEqual(await history(admin), []);
  await assert.rejects(
    asUser(null, "select public.fetch_gig_history()", [], "anon"),
    /permission denied/,
  );
});
test("gig history supports pagination with an extra row to indicate another page", async () => {
  const first = (
    await asUser(owner, "select public.fetch_gig_history(0,1) as gigs")
  ).rows[0].gigs;
  const next = (
    await asUser(owner, "select public.fetch_gig_history(1,1) as gigs")
  ).rows[0].gigs;
  assert.equal(first.length, 2);
  assert.equal(next.length, 1);
  assert.equal(first[1].id, next[0].id);
});
test("flagged media creates a private case and initial history atomically", async () => {
  for (const [id, hash] of [
    [caseA, "a"],
    [caseB, "b"],
    [caseC, "c"],
  ]) {
    await db.query(
      `insert into public.upload_moderation_cases(id,user_id,content_hash,context,file_name,media_kind,preview_path,reason,categories,confidence) values($1,$2,$3,'test','test.jpg','photo','private-preview.jpg','AI reason','["violence"]',0.91)`,
      [id, applicant, hash],
    );
  }
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.upload_moderation_history",
      )
    ).rows[0].n,
    3,
  );
  assert.equal(
    (
      await db.query(
        "select public from storage.buckets where id='moderation-quarantine'",
      )
    ).rows[0].public,
    false,
  );
  await assert.rejects(
    asUser(applicant, "select * from public.upload_moderation_cases"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(
      admin,
      "select public.review_upload_moderation_case($1,$2,$3,$4,$5)",
      [caseA, admin, "approve", "Reason", 0],
    ),
    /permission denied/,
  );
  await assert.rejects(
    review(caseA, "approve", 0, other),
    /Admin role required/,
  );
});
test("quarantine cannot be read, replaced, deleted, or attached to another uploader even under legacy broad policies", async () => {
  await db.query(
    "insert into storage.objects(bucket_id,name) values('moderation-quarantine',$1)",
    [`${applicant}/${caseA}/preview.jpg`],
  );
  for (const role of ["anon", "authenticated"]) {
    const rows = await asUser(
      applicant,
      "select * from storage.objects where bucket_id='moderation-quarantine'",
      [],
      role,
    );
    assert.equal(rows.rows.length, 0);
    assert.equal(
      (
        await asUser(
          applicant,
          "delete from storage.objects where bucket_id='moderation-quarantine' returning id",
          [],
          role,
        )
      ).rows.length,
      0,
    );
  }
  await assert.rejects(
    asUser(
      other,
      "insert into storage.objects(bucket_id,name) values('moderation-quarantine',$1)",
      [`${applicant}/${caseA}/original.jpg`],
    ),
    /row-level security/,
  );
  await asUser(
    applicant,
    "insert into storage.objects(bucket_id,name) values('moderation-quarantine',$1)",
    [`${applicant}/${caseA}/original.jpg`],
  );
});
test("approval and rejection are audited, notify the uploader, and resist stale admin decisions", async () => {
  assert.equal((await review(caseA, "approve", 0)).rows[0].status, "approved");
  await assert.rejects(review(caseA, "reject", 0), /Case changed/);
  await assert.rejects(review(caseA, "reject", null), /Case changed/);
  await assert.rejects(review(caseA, "reject", 1), /already been decided/);
  assert.equal((await review(caseB, "reject", 0)).rows[0].status, "rejected");
  assert.equal(
    (await db.query("select count(*)::int as n from public.notifications"))
      .rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.upload_moderation_history where actor_id=$1",
        [admin],
      )
    ).rows[0].n,
    2,
  );
  await assert.rejects(
    review(caseC, "approve", 0, admin, ""),
    /notes are required/,
  );
});
test("admins can scope upload and social-posting restrictions independently", async () => {
  assert.equal(
    (await review(caseC, "warn", 0)).rows[0].status,
    "pending_review",
  );
  await review(caseC, "restrict_7_days", 1);
  assert.deepEqual(
    (
      await db.query(
        "select restriction_scopes from public.upload_moderation_restrictions where user_id=$1",
        [applicant],
      )
    ).rows[0].restriction_scopes,
    ["media_upload"],
  );
  await asUser(
    applicant,
    "insert into public.feed_posts(author_id,content) values($1,'upload-only restriction permits text posts')",
    [applicant],
  );
  assert.equal(
    (
      await asUser(
        applicant,
        "select public.media_uploads_allowed() as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await assert.rejects(
    asUser(
      applicant,
      "insert into storage.objects(bucket_id,name) values('post-media','new.jpg')",
    ),
    /row-level security/,
  );
  await review(caseC, "restrict_content_7_days", 2);
  assert.deepEqual(
    (
      await db.query(
        "select restriction_scopes from public.upload_moderation_restrictions where user_id=$1",
        [applicant],
      )
    ).rows[0].restriction_scopes,
    ["media_upload", "social_posting"],
  );
  await assert.rejects(
    asUser(
      applicant,
      "insert into public.feed_posts(author_id,content) values($1,'must be blocked')",
      [applicant],
    ),
    /row-level security/,
  );
  const existingPost = uid(40);
  await db.query(
    "insert into public.feed_posts(id,author_id,content) values($1,$2,'existing')",
    [existingPost, applicant],
  );
  assert.equal(
    (
      await asUser(
        applicant,
        "update public.feed_posts set content='must stay unchanged' where id=$1 returning id",
        [existingPost],
      )
    ).rows.length,
    0,
  );
  await review(caseC, "lift_posting_restriction", 3);
  assert.deepEqual(
    (
      await db.query(
        "select restriction_scopes from public.upload_moderation_restrictions where user_id=$1",
        [applicant],
      )
    ).rows[0].restriction_scopes,
    ["media_upload"],
  );
  await asUser(
    applicant,
    "insert into public.feed_posts(author_id,content) values($1,'posting restored')",
    [applicant],
  );
  await review(caseC, "lift_restriction", 4);
  assert.equal(
    (
      await asUser(
        applicant,
        "select public.media_uploads_allowed() as allowed",
      )
    ).rows[0].allowed,
    true,
  );
  await asUser(
    applicant,
    "insert into storage.objects(bucket_id,name) values('post-media','new.jpg')",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.upload_moderation_history where case_id=$1",
        [caseC],
      )
    ).rows[0].n,
    6,
  );
});
test("a notification failure rolls back the moderation decision and audit together", async () => {
  await db.exec(`create function public.fail_test_notification() returns trigger language plpgsql as $$ begin raise exception 'test notification failure'; end; $$;
    create trigger fail_test_notification before insert on public.notifications for each row execute function public.fail_test_notification();`);
  await assert.rejects(review(caseC, "reject", 5), /test notification failure/);
  const entry = (
    await db.query(
      "select status,version from public.upload_moderation_cases where id=$1",
      [caseC],
    )
  ).rows[0];
  assert.deepEqual(entry, { status: "pending_review", version: 5 });
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.upload_moderation_history where case_id=$1",
        [caseC],
      )
    ).rows[0].n,
    6,
  );
});

test("evidence retention cleanup preserves decisions and hashes, and never clears pending evidence", async () => {
  await db.query("update public.upload_moderation_cases set evidence_delete_after=now()-interval '1 day' where id in ($1,$2)", [caseA,caseC]);
  await db.query('select public.finalize_moderation_evidence_cleanup($1)',[caseA]);
  await db.query('select public.finalize_moderation_evidence_cleanup($1)',[caseC]);
  const approved = (await db.query('select status,content_hash,preview_path,evidence_deleted_at from public.upload_moderation_cases where id=$1',[caseA])).rows[0];
  assert.equal(approved.status,'approved'); assert.equal(approved.content_hash,'a'); assert.equal(approved.preview_path,null); assert.ok(approved.evidence_deleted_at);
  assert.equal((await db.query('select preview_path from public.upload_moderation_cases where id=$1',[caseC])).rows[0].preview_path,'private-preview.jpg');
});

test("account deletion preserves uploader and reviewer history without blocking deletion", async () => {
  await db.query('delete from public.profiles where id in ($1,$2)',[applicant,admin]);
  const entry = (await db.query('select user_id,uploader_name from public.upload_moderation_cases where id=$1',[caseA])).rows[0];
  assert.deepEqual(entry,{user_id:null,uploader_name:'Solo'});
  const event = (await db.query("select actor_id,actor_name from public.upload_moderation_history where case_id=$1 and action='approve'",[caseA])).rows[0];
  assert.deepEqual(event,{actor_id:null,actor_name:'Admin'});
});
