# Phase 1 Commercial Booking - Verification Checklist

> **Test Accounts (password: `pass123` for all)**
>
> | Email | Name | Role | Production Team | Location |
> |---|---|---|---|---|
> | producer1@test.com | Jonathan Santos | producer | Star Music Productions | Quezon City, Metro Manila |
> | producer2@test.com | Rafael Mendoza | producer | Viva Entertainment Productions | Makati City, Metro Manila |
> | producer3@test.com | Maria Cristina Reyes | producer | PolyEast Productions | Pasig City, Metro Manila |
> | producer4@test.com | Diego Villanueva | producer | Tower of Doom Productions | Taguig City, Metro Manila |
> | producer5@test.com | Angelo Bautista | producer | Ivory Music Productions | Mandaluyong City, Metro Manila |
>
> **Existing test accounts (password: `pass123`):** manager@test.com (venue-owner), musician@tet.com (musician), studio@test.com (studio-owner)

---

## 1. DATABASE SCHEMA VERIFICATION

### New Tables
- [ ] `production_teams` exists with columns: id, owner_id, name, description, logo_url, created_at, updated_at
- [ ] `production_team_members` exists with: id, team_id, user_id, role (owner/manager/member), joined_at, unique constraint on (team_id, user_id)
- [ ] `venue_partnership_deals` exists with: id, venue_owner_id, production_team_id, gig_id, title, status, proposed_by_user_id, accepted_term_version_id, settled_at, created_at, updated_at
- [ ] `deal_term_versions` exists with: id, deal_id, version_number, revenue_split_venue_pct, revenue_split_production_pct, fixed_fee, deposit_amount, event_date, event_notes, cancellation_notice_days, cancellation_penalty_pct, additional_terms, proposed_by_user_id, created_at
- [ ] `deal_negotiation_events` exists with: id, deal_id, event_type, actor_user_id, term_version_id, notes, metadata (jsonb), created_at
- [ ] `studio_recording_deals` exists with: id, studio_id, counterparty_id, title, status, proposed_by_user_id, valid_from, valid_until, notes, accepted_at, created_at, updated_at
- [ ] `recording_deal_packages` exists with: id, deal_id, name, hours_included, songs_included, price, max_sessions, description, sort_order, created_at
- [ ] `booking_cancellation_policies` exists with: id, studio_id, name, full_refund_hours_before, partial_refund_hours_before, partial_refund_pct, no_show_penalty_pct, late_cancel_penalty_pct, is_active, created_at, updated_at
- [ ] `booking_penalty_events` exists with: id, booking_id, policy_snapshot, penalty_type, penalty_amount, refund_amount, booking_total, penalized_user_id, beneficiary_user_id, wallet_transaction_id, refund_transaction_id, notes, created_at

### Extensions to Existing Tables
- [ ] `studio_bookings` has columns: recording_deal_id, recording_deal_package_id, cancellation_policy_id, cancellation_policy_snapshot
- [ ] `wallet_transactions` has column: reference_type (text)
- [ ] `booking_incidents` has columns: penalty_event_id, settlement_hold (boolean default false)
- [ ] `profiles` role CHECK constraint includes 'producer' and 'admin'
- [ ] `studio_settings` has column: recording_rate_negotiable (boolean default false)

### Indexes
- [ ] idx_production_teams_owner, idx_ptm_team, idx_ptm_user
- [ ] idx_vpd_venue_owner, idx_vpd_production_team, idx_vpd_proposed_by, idx_vpd_gig
- [ ] idx_vpd_status_active partial index (proposed/countered/accepted)
- [ ] idx_dtv_deal, idx_dtv_proposed_by, idx_dne_deal, idx_dne_actor, idx_dne_term_version
- [ ] idx_srd_studio, idx_srd_counterparty, idx_srd_proposed_by, idx_srd_status_active
- [ ] idx_rdp_deal, idx_bcp_studio, idx_bcp_studio_active
- [ ] idx_bpe_booking, idx_bpe_penalized, idx_bpe_beneficiary, idx_bpe_wallet_tx, idx_bpe_refund_tx
- [ ] idx_sb_recording_deal, idx_sb_recording_package, idx_sb_cancellation_policy, idx_bi_penalty_event

---

## 2. RLS POLICIES (23 total)

### production_teams
- [ ] Team owners can manage their teams (ALL where auth.uid() = owner_id)
- [ ] Team members can view their teams (SELECT via membership)
- [ ] Deal participants can view teams (SELECT via deal link)

### production_team_members
- [ ] Members can view own memberships (SELECT where user_id = auth.uid())
- [ ] Owners/managers can manage members (ALL with role check)
- [ ] Owner bootstrap INSERT policy

### venue_partnership_deals
- [ ] Participants can SELECT (venue_owner_id or team member)
- [ ] Proposers can INSERT
- [ ] Participants can UPDATE (team owner/manager only)

### deal_term_versions & deal_negotiation_events
- [ ] Deal participants can SELECT
- [ ] Proposers/actors can INSERT

### studio_recording_deals & recording_deal_packages
- [ ] Studio owners can manage (ALL)
- [ ] Counterparties can SELECT and UPDATE

### booking_cancellation_policies
- [ ] Authenticated users can SELECT active policies
- [ ] Studio owners can manage

### booking_penalty_events
- [ ] Booking participants can SELECT their events

---

## 3. SQL FUNCTIONS & VIEWS

### Functions
- [ ] `calculate_booking_cancellation_penalty(booking_id, cancellation_time)` → penalty_type, amounts, policy_snapshot
- [ ] `apply_booking_penalty(booking_id, penalty_type, notes)` → atomic penalty + wallet transactions
- [ ] `calculate_deal_settlement(deal_id, deal_type, gross_revenue)` → venue/production shares
- [ ] `mark_deal_terms_accepted(deal_id, term_version_id, accepted_by_user_id)` → row-locked state transition
- [ ] `resolve_active_recording_package(studio_id, counterparty_id, hours)` → matching deal/package

### Views
- [ ] `venue_partnership_deals_with_summary` — team details, venue owner, gig, current terms, event count
- [ ] `studio_recording_deals_with_summary` — studio details, counterparty, packages as JSON array
- [ ] `booking_penalty_events_with_summary` — booking details, user names, wallet transaction info

---

## 4. EDGE FUNCTION: manage-deals (18 actions)

### Production Team Actions
- [ ] `create_production_team` — creates team + auto-adds owner as member
- [ ] `add_team_member` — owner/manager only, prevents duplicates (409)
- [ ] `remove_team_member` — cannot remove owner
- [ ] `list_my_teams` — returns teams with member_role

### Venue Partnership Deal Actions
- [ ] `create_venue_partnership_deal` — validates 100% split, creates deal + term v1, records proposal event, notifies
- [ ] `counter_venue_partnership_deal` — increments version, status→countered, records event
- [ ] `accept_venue_partnership_deal` — uses mark_deal_terms_accepted, prevents self-accept, notifies both
- [ ] `reject_venue_partnership_deal` — status→rejected, records event

### Recording Deal Actions
- [ ] `create_recording_deal` — creates deal + initial packages, notifies counterparty
- [ ] `add_recording_package` — validates ownership, calculates sort_order
- [ ] `accept_recording_deal` — prevents self-accept, status→accepted with timestamp

### Deal Listing & Details
- [ ] `list_my_deals` — returns venue_partnerships + recording_deals, supports filters
- [ ] `get_deal_details` — full deal with nested terms/events or packages

### Settlement & Dispute
- [ ] `mark_settlement_paid` — venue owner only, calculates settlement, status→settled
- [ ] `raise_deal_dispute` — participants only, status→disputed, notifies all

### Cancellation Policy
- [ ] `create_cancellation_policy` — studio owner only, deactivates existing policies

---

## 5. PRODUCER SIGNUP & ROUTING

### signup.tsx
- [ ] Producer role appears in role selection (3rd option)
- [ ] Producer can complete signup flow
- [ ] Profile created with role='producer'

### home.tsx
- [ ] isProducer flag set when role === 'producer'
- [ ] Conditional UI based on producer status

### Navigation
- [ ] Producer routed to /production_team from navbar
- [ ] production_team.tsx accessible and loads teams

---

## 6. MOBILE: Deals Tab (bookings.tsx)

- [ ] "Deals" tab visible alongside existing booking tabs
- [ ] Fetches via "list_my_deals" on tab activation
- [ ] Maps venue_partnerships + recording_deals into unified list
- [ ] Each item shows: title, type badge, status badge (color-coded), participants
- [ ] Tapping navigates to deal_details with deal_id and deal_type
- [ ] Non-critical fetch — errors don't crash page

---

## 7. MOBILE: deal_details.tsx

### Venue Partnership View
- [ ] Shows production team + venue owner details
- [ ] Lists all deal_term_versions with version numbers
- [ ] Highlights accepted term version
- [ ] Shows term details: splits, fee, deposit, event date, cancellation terms
- [ ] Shows negotiation event timeline

### Recording Deal View
- [ ] Shows studio + counterparty details
- [ ] Lists packages with hours, songs, price, max_sessions
- [ ] Shows validity period

### Actions
- [ ] **Accept** button calls correct endpoint (prevents self-accept)
- [ ] **Counter** modal with term inputs (validates 100% split)
- [ ] **Reject** with optional notes
- [ ] **Mark Settlement Paid** with gross_revenue input (accepted deals only)
- [ ] **Raise Dispute** with optional notes (accepted/settled deals)
- [ ] Loading states + success/error alerts

---

## 8. MOBILE: production_team.tsx

- [ ] Lists teams user is member of (via list_my_teams)
- [ ] Shows team name, logo, member role
- [ ] Create team modal (name + description)
- [ ] Team detail shows members with roles
- [ ] Add member modal (email + role: member/manager)
- [ ] Remove member (except owner)
- [ ] Proper loading states and alerts

---

## 9. MOBILE: Studio Screens

### add_studio.tsx — Negotiable Pricing
- [ ] Toggle for recording_rate_negotiable visible in pricing section
- [ ] Default state is false
- [ ] Persists to studio_settings on creation

### edit_studio.tsx — Negotiable Pricing
- [ ] Toggle loads current recording_rate_negotiable value
- [ ] Updates on save

### manage_studio.tsx — Deals & Policies Tab
- [ ] "Deals" tab visible
- [ ] Recording deals section (list + create)
- [ ] Cancellation policy section (view active + create new)
- [ ] Policy fields: name, refund windows, penalty percentages
- [ ] Penalty events display with amounts and types

---

## 10. MOBILE: add_gig.tsx — Partnership Entry

- [ ] "Production Partnership" section visible
- [ ] Explanatory text about proposing deals after gig creation
- [ ] Navigation/guidance to deal creation

---

## 11. MOBILE: wallet.tsx — Commercial References

- [ ] reference_type filtering for penalty/refund/deal/settlement transactions
- [ ] Penalty transactions show type and amounts
- [ ] Refund transactions show origin
- [ ] Wallet balance reflects penalty/refund updates

---

## 12. WEB: admin/deals.tsx — Admin Dashboard

### Access & Navigation
- [ ] Route /admin/deals accessible
- [ ] Restricted to admin users
- [ ] "Deals" tab in admin navigation

### Metrics Overview
- [ ] Total Venue Partnerships + active count
- [ ] Total Recording Deals + active count
- [ ] Disputed deals count
- [ ] Total penalties count + amount
- [ ] Total refunds amount
- [ ] Active settlement holds count

### Venue Partnership Deals
- [ ] Lists all deals with title, status badge, team name, venue owner, gig
- [ ] Expandable detail: splits, fee, deposit, event date, version, settled_at, last activity
- [ ] Search + status filter
- [ ] 30s cache TTL

### Recording Deals
- [ ] Lists all deals with title, status badge, studio, counterparty, package count
- [ ] Expandable detail: validity period, accepted_at, notes
- [ ] Search + status filter

### Booking Penalties
- [ ] Lists all penalty events with type, amounts, users, dates
- [ ] Penalty type filter (all/late_cancellation/no_show)
- [ ] Search across studio, users, notes

### Settlement Holds
- [ ] Lists incidents with settlement_hold = true
- [ ] Shows issue_type, status, booking_id, notes

---

## 13. END-TO-END FLOWS

### Flow A: Venue Partnership (Propose → Counter → Accept → Settle)
1. [ ] Log in as producer1@test.com → go to production_team → verify Star Music Productions visible
2. [ ] Navigate to Deals → create venue partnership deal with manager@test.com
3. [ ] Log in as manager@test.com → see deal notification → view deal in deals tab
4. [ ] Counter-offer with different revenue split → verify 100% validation
5. [ ] Log in as producer1@test.com → accept counter terms
6. [ ] Log in as manager@test.com → mark settlement paid with gross revenue
7. [ ] Verify wallet transactions for both parties
8. [ ] Check admin/deals page shows deal as settled with correct splits

### Flow B: Recording Deal (Propose → Add Packages → Accept)
1. [ ] Log in as studio@test.com → manage studio → Deals tab
2. [ ] Create recording deal targeting producer2@test.com
3. [ ] Add 3 tiered packages (Basic/Standard/Premium)
4. [ ] Log in as producer2@test.com → view recording deal → accept
5. [ ] Verify deal status = accepted with timestamp
6. [ ] Check admin/deals page shows deal

### Flow C: Cancellation Penalty
1. [ ] Log in as studio@test.com → manage studio → create cancellation policy
2. [ ] Set: full refund 48h before, partial 50% 24h before, no-show 100%, late cancel 75%
3. [ ] Create a booking with this studio (as musician@tet.com)
4. [ ] Cancel booking within late-cancel window
5. [ ] Verify penalty event created with correct type and amounts
6. [ ] Check wallet: studio credited, user refunded partial amount
7. [ ] Check admin/deals penalty section

### Flow D: Dispute
1. [ ] Use an accepted venue partnership deal
2. [ ] Either party raises dispute
3. [ ] Verify deal status → disputed
4. [ ] Check admin/deals shows disputed deal + settlement hold

---

## 14. VALIDATION & ERROR HANDLING

- [ ] Revenue splits ≠ 100% → rejected with clear error
- [ ] Self-accept attempt → rejected
- [ ] Unauthorized user accessing deal → denied by RLS
- [ ] Remove team owner → rejected
- [ ] Duplicate team member → 409 error
- [ ] Invalid deal state transition (e.g., settled → proposed) → rejected

---

## 15. NOTIFICATIONS

- [ ] Deal proposal → notify recipient
- [ ] Counter offer → notify other party
- [ ] Deal accepted → notify all parties
- [ ] Deal rejected → notify all parties
- [ ] Settlement paid → notify production team
- [ ] Dispute raised → notify all parties

---

## 16. REGRESSION CHECKS

- [ ] Existing studio bookings work (new columns are optional/nullable)
- [ ] Existing cancellation flow works (policy_id defaults to NULL)
- [ ] Existing wallet operations work with new reference_type column
- [ ] Existing booking incidents work (penalty_event_id, settlement_hold optional)
- [ ] Musician/venue-owner signup not broken by producer role addition
- [ ] New notifications don't interfere with existing booking notifications

---

## Quick Start: What to Test First

1. **Schema** — Run `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` to confirm all 9 new tables
2. **RLS** — Try accessing deals as unauthorized user
3. **E2E Flow A** — Full venue partnership lifecycle with test accounts
4. **E2E Flow B** — Full recording deal lifecycle
5. **E2E Flow C** — Cancellation penalty flow
6. **Admin Dashboard** — Verify all data shows up on web admin/deals
7. **Producer Signup** — Fresh signup → production team → deal creation
