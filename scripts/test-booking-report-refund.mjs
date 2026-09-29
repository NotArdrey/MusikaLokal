import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
after(() => db.close());

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const customerId = uid(1);
const ownerId = uid(2);
const adminId = uid(3);
const nonAdminId = uid(4);
const studioId = uid(10);
const bookingId = uid(20);
const reportId = uid(30);

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create table public.profiles(id uuid primary key, role text);
  create table public.groups(id uuid primary key);
  create table public.studios(id uuid primary key, owner_id uuid, name text);
  create table public.gigs(id uuid primary key);
  create table public.products(id uuid primary key);
  create table public.playlists(id uuid primary key);
  create table public.feed_posts(id uuid primary key);

  create table public.studio_bookings(
    id uuid primary key,
    user_id uuid not null,
    studio_id uuid not null,
    status text default 'pending',
    payment_status text default 'unpaid',
    payment_amount numeric,
    final_price numeric default 0,
    remaining_balance numeric default 0,
    refund_amount numeric,
    refund_id text,
    refunded_at timestamptz,
    cancellation_reason text,
    updated_at timestamptz default now()
  );

  create table public.reports(
    id uuid primary key,
    reporter_id uuid,
    target_type text not null,
    target_id uuid not null,
    reason text not null,
    details text,
    status text default 'pending',
    created_at timestamptz default now(),
    reviewed_by uuid,
    reviewed_at timestamptz,
    moderation_action text default 'none' not null,
    moderation_notes text,
    escalation_status text default 'none' not null,
    escalated_at timestamptz,
    escalation_reason text
  );

  create table public.wallets(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique,
    balance numeric default 0,
    updated_at timestamptz default now()
  );

  create table public.wallet_transactions(
    id uuid primary key default gen_random_uuid(),
    wallet_id uuid not null,
    amount numeric not null,
    type text not null,
    description text,
    reference_id uuid,
    reference_type text,
    is_credit boolean default true,
    status text default 'completed',
    created_at timestamptz default now()
  );

  create table public.notifications(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    type text not null,
    title text not null,
    message text not null,
    read boolean default false,
    meta jsonb default '{}'::jsonb
  );
`);

const mobileMigration = readFileSync(
  new URL(
    "../mobile/supabase/migrations/20260929120000_add_booking_reports_and_admin_wallet_refunds.sql",
    import.meta.url,
  ),
  "utf8",
);
const webMigration = readFileSync(
  new URL(
    "../web/supabase/migrations/20260929120000_add_booking_reports_and_admin_wallet_refunds.sql",
    import.meta.url,
  ),
  "utf8",
);

assert.equal(mobileMigration.replace(/\r\n/g, "\n"), webMigration.replace(/\r\n/g, "\n"));
await db.exec(mobileMigration);

await db.exec(`
  insert into public.profiles(id, role) values
    ('${customerId}', 'musician'),
    ('${ownerId}', 'studio-owner'),
    ('${adminId}', 'admin'),
    ('${nonAdminId}', 'musician');
  insert into public.studios(id, owner_id, name)
  values ('${studioId}', '${ownerId}', 'Test Studio');
  insert into public.studio_bookings(
    id, user_id, studio_id, status, payment_status, payment_amount, final_price, remaining_balance
  ) values (
    '${bookingId}', '${customerId}', '${studioId}', 'confirmed', 'paid', 750, 750, 0
  );
  insert into public.reports(id, reporter_id, target_type, target_id, reason)
  values ('${reportId}', '${customerId}', 'booking', '${bookingId}', 'Service was not provided as agreed');
`);

test("admin booking-report refund is atomic and idempotent", async () => {
  const first = await db.query(
    `select public.admin_refund_reported_booking($1, $2, $3) as result`,
    [reportId, adminId, "Verified by support."],
  );
  assert.equal(first.rows[0].result.success, true);
  assert.equal(Number(first.rows[0].result.refund_amount), 750);
  assert.equal(first.rows[0].result.already_refunded, false);

  const wallet = await db.query(`select balance from public.wallets where user_id = $1`, [customerId]);
  assert.equal(Number(wallet.rows[0].balance), 750);

  const transactions = await db.query(
    `select amount from public.wallet_transactions where reference_id = $1 and type = 'refund'`,
    [bookingId],
  );
  assert.equal(transactions.rows.length, 1);
  assert.equal(Number(transactions.rows[0].amount), 750);

  const booking = await db.query(
    `select status, payment_status, refund_amount from public.studio_bookings where id = $1`,
    [bookingId],
  );
  assert.equal(booking.rows[0].status, "cancelled");
  assert.equal(booking.rows[0].payment_status, "refunded");
  assert.equal(Number(booking.rows[0].refund_amount), 750);

  const report = await db.query(`select status, reviewed_by from public.reports where id = $1`, [reportId]);
  assert.equal(report.rows[0].status, "resolved");
  assert.equal(report.rows[0].reviewed_by, adminId);

  const second = await db.query(
    `select public.admin_refund_reported_booking($1, $2, null) as result`,
    [reportId, adminId],
  );
  assert.equal(second.rows[0].result.already_refunded, true);

  const walletAfterRetry = await db.query(`select balance from public.wallets where user_id = $1`, [customerId]);
  assert.equal(Number(walletAfterRetry.rows[0].balance), 750);

  const transactionsAfterRetry = await db.query(
    `select id from public.wallet_transactions where reference_id = $1 and type = 'refund'`,
    [bookingId],
  );
  assert.equal(transactionsAfterRetry.rows.length, 1);
});

test("non-admin callers cannot approve a booking refund", async () => {
  await assert.rejects(
    db.query(
      `select public.admin_refund_reported_booking($1, $2, null)`,
      [reportId, nonAdminId],
    ),
    /Admin role required/,
  );
});

test("booking reports are normalized and validated", async () => {
  const secondBookingId = uid(21);
  const secondReportId = uid(31);
  await db.exec(`
    insert into public.studio_bookings(
      id, user_id, studio_id, status, payment_status, payment_amount, final_price, remaining_balance
    ) values (
      '${secondBookingId}', '${customerId}', '${studioId}', 'pending', 'unpaid', 0, 500, 500
    );
    insert into public.reports(id, reporter_id, target_type, target_id, reason)
    values ('${secondReportId}', '${customerId}', 'studio_booking', '${secondBookingId}', 'Payment problem');
  `);

  const normalized = await db.query(`select target_type from public.reports where id = $1`, [secondReportId]);
  assert.equal(normalized.rows[0].target_type, "booking");

  await assert.rejects(
    db.query(
      `select public.admin_refund_reported_booking($1, $2, null)`,
      [secondReportId, adminId],
    ),
    /no refundable payment/,
  );
});
