import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const clientCooldownFiles = [
  "mobile/src/components/ListingDetailsSheet.tsx",
  "web/src/components/ListingDetailsSheet.tsx",
  "mobile/src/hooks/useApplicationSubmissionAction.ts",
  "web/src/hooks/useApplicationSubmissionAction.ts",
];

test("system closures caused by requirement changes do not start a cooldown", async () => {
  for (const path of clientCooldownFiles) {
    const source = await read(path);
    assert.match(
      source,
      /system_status_reason\.is\.null,system_status_reason\.neq\.system_requirements_changed/,
      `${path} must exclude requirement-change closures`,
    );
  }

  for (const platform of ["mobile", "web"]) {
    const edgeFunction = await read(
      `${platform}/supabase/functions/listings-crud/index.ts`,
    );
    assert.match(
      edgeFunction,
      /system_status_reason\.is\.null,system_status_reason\.neq\.system_requirements_changed/,
      `${platform} server guard must exclude requirement-change closures`,
    );

    const migration = await read(
      `${platform}/supabase/migrations/20260927200000_exempt_requirement_change_rejections_from_cooldown.sql`,
    );
    assert.match(
      migration,
      /system_status_reason is distinct from 'system_requirements_changed'/,
      `${platform} database helper must exclude requirement-change closures`,
    );
  }
});

test("cooldowns are scoped independently for solo, group, and production applications", async () => {
  for (const path of clientCooldownFiles) {
    const source = await read(path);
    assert.match(source, /else if \(selectedGroupId\)/, `${path} needs a group scope`);
    assert.match(source, /\.eq\("group_id", selectedGroupId\)/, `${path} needs the selected group ID`);
    assert.match(source, /\.eq\("production_team_id", selectedProductionTeamId\)/, `${path} needs a production scope`);
    assert.match(source, /\.is\("group_id", null\)/, `${path} must isolate solo applications`);
    assert.match(source, /\.is\("production_team_id", null\)/, `${path} must exclude production rows from non-production scopes`);
  }

  for (const platform of ["mobile", "web"]) {
    const source = await read(`${platform}/supabase/functions/listings-crud/index.ts`);
    assert.match(source, /if \(production_team_id\)/);
    assert.match(source, /else if \(group_id\)/);
    assert.match(source, /\.is\('group_id', null\)/);
    assert.match(source, /\.is\('production_team_id', null\)/);
  }
});

test("clients always refresh the current cooldown and only active group applications block", async () => {
  for (const path of clientCooldownFiles) {
    const source = await read(path);
    assert.match(
      source,
      /from\("gigs"\)[\s\S]*select\("reapplication_cooldown_days"\)/,
      `${path} must read the live gig cooldown`,
    );
    assert.match(
      source,
      /gigSettings\?\.reapplication_cooldown_days\s*\?\?[\s\S]*group\.reapplication_cooldown_days/,
      `${path} must prefer the live cooldown over its listing snapshot`,
    );
  }

  for (const path of [
    "mobile/src/components/ListingDetailsSheet.tsx",
    "web/src/components/ListingDetailsSheet.tsx",
  ]) {
    const source = await read(path);
    assert.match(
      source,
      /\.eq\("group_id", groupId\)[\s\S]*\.in\("status", \["pending", "accepted", "approved"\]\)/,
      `${path} must not treat historical closed applications as active`,
    );
  }
});

test("database insert guard applies the live cooldown to solo applicants and every group submitter", async () => {
  const database = new PGlite();
  const migration = await read(
    "mobile/supabase/migrations/20260929210000_enforce_gig_reapplication_cooldown_on_insert.sql",
  );

  await database.exec(`
    create table public.gigs (
      id uuid primary key,
      reapplication_cooldown_days numeric
    );
    create table public.gig_applications (
      id uuid primary key,
      gig_id uuid not null references public.gigs(id),
      applicant_id uuid not null,
      group_id uuid,
      production_team_id uuid,
      status text not null,
      rejected_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      system_status_reason text
    );
    ${migration}
  `);

  const noCooldownGig = "00000000-0000-4000-8000-000000000010";
  const cooldownGig = "00000000-0000-4000-8000-000000000020";
  const groupId = "00000000-0000-4000-8000-000000000030";
  const firstMember = "00000000-0000-4000-8000-000000000040";
  const otherMember = "00000000-0000-4000-8000-000000000050";

  await database.query(
    "insert into public.gigs (id, reapplication_cooldown_days) values ($1, 0), ($2, 30)",
    [noCooldownGig, cooldownGig],
  );
  await database.query(
    `insert into public.gig_applications
      (id, gig_id, applicant_id, group_id, status, rejected_at)
     values
      ('00000000-0000-4000-8000-000000000061', $1, $2, $3, 'rejected', now()),
      ('00000000-0000-4000-8000-000000000062', $4, $2, $3, 'rejected', now()),
      ('00000000-0000-4000-8000-000000000063', $4, $2, null, 'rejected', now())`,
    [noCooldownGig, firstMember, groupId, cooldownGig],
  );

  await database.query(
    `insert into public.gig_applications
      (id, gig_id, applicant_id, group_id, status)
     values ('00000000-0000-4000-8000-000000000071', $1, $2, $3, 'pending')`,
    [noCooldownGig, otherMember, groupId],
  );

  await assert.rejects(
    database.query(
      `insert into public.gig_applications
        (id, gig_id, applicant_id, group_id, status)
       values ('00000000-0000-4000-8000-000000000072', $1, $2, $3, 'pending')`,
      [cooldownGig, otherMember, groupId],
    ),
    /cooldown is still active/i,
  );

  await assert.rejects(
    database.query(
      `insert into public.gig_applications
        (id, gig_id, applicant_id, status)
       values ('00000000-0000-4000-8000-000000000073', $1, $2, 'pending')`,
      [cooldownGig, firstMember],
    ),
    /cooldown is still active/i,
  );

  await database.close();
});

test("database helper distinguishes a system closure from an organizer decline", async () => {
  const database = new PGlite();
  const migration = await read(
    "mobile/supabase/migrations/20260927200000_exempt_requirement_change_rejections_from_cooldown.sql",
  );

  await database.exec(`
    create table public.gigs (
      id uuid primary key,
      reapplication_cooldown_days numeric
    );
    create table public.gig_applications (
      id uuid primary key,
      gig_id uuid not null,
      applicant_id uuid not null,
      status text not null,
      rejected_at timestamptz,
      created_at timestamptz not null,
      system_status_reason text
    );
    ${migration}
  `);

  const gigId = "00000000-0000-4000-8000-000000000001";
  const applicantId = "00000000-0000-4000-8000-000000000002";
  await database.query(
    "insert into public.gigs (id, reapplication_cooldown_days) values ($1, 30)",
    [gigId],
  );
  await database.query(
    `insert into public.gig_applications
      (id, gig_id, applicant_id, status, rejected_at, created_at, system_status_reason)
     values ($1, $2, $3, 'rejected', now(), now(), 'system_requirements_changed')`,
    ["00000000-0000-4000-8000-000000000003", gigId, applicantId],
  );

  let result = await database.query(
    "select public.can_musician_reapply($1, $2) as allowed",
    [gigId, applicantId],
  );
  assert.equal(result.rows[0].allowed, true);

  await database.query(
    `insert into public.gig_applications
      (id, gig_id, applicant_id, status, rejected_at, created_at, system_status_reason)
     values ($1, $2, $3, 'rejected', now(), now(), null)`,
    ["00000000-0000-4000-8000-000000000004", gigId, applicantId],
  );

  result = await database.query(
    "select public.can_musician_reapply($1, $2) as allowed",
    [gigId, applicantId],
  );
  assert.equal(result.rows[0].allowed, false);

  await database.close();
});
