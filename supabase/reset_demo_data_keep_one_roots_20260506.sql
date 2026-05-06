begin;

create temp table root_profiles(id uuid primary key) on commit drop;
insert into root_profiles(id) values
  ('4ac24041-ff7e-4482-b775-dc0cc5d3aac9'),
  ('77508736-9566-4538-96cb-4ae34be56a56'),
  ('bbfd86e2-3a7b-4a1b-94fe-9e6715d5a69b');

delete from public.message_reactions;
delete from public.messages;
delete from public.conversation_participants;
delete from public.conversations;

delete from public.booking_attendance_events;
delete from public.booking_incidents;
delete from public.booking_penalty_events;
delete from public.studio_booking_slots;
delete from public.booking_holds;
delete from public.booking_requests;
delete from public.studio_bookings;

delete from public.order_fulfillments;
delete from public.order_items;
delete from public.orders;

delete from public.review_likes;
delete from public.reviews;
delete from public.favorites;
delete from public.reports;
delete from public.notifications;
delete from public.notification_preferences;
delete from public.email_notifications;

delete from public.social_activity_events;
delete from public.post_reactions;
delete from public.post_comments;
delete from public.post_media;
update public.feed_posts set linked_product_id = null, linked_playlist_id = null;
delete from public.feed_posts;
delete from public.follows;

delete from public.station_playlist_slots;
delete from public.playlist_play_events;
delete from public.group_playlists;
update public.external_platform_links set linked_item_id = null, linked_playlist_id = null;
delete from public.playlist_items;
delete from public.playlist_teaser_assets;
delete from public.external_platform_links;
delete from public.playlists;

delete from public.gig_slot_fill_applicants;
delete from public.gig_slot_fill_summary;

delete from public.wallet_deposits;
delete from public.withdrawal_requests;
delete from public.payout_methods;
delete from public.wallet_transactions;
delete from public.wallets;

delete from public.subscription_payments;
delete from public.subscriptions;

delete from public.address_verification_sessions;
delete from public.manual_identity_reviews;
delete from public.verification_sessions;
delete from public.push_notification_devices;

delete from public.leadership_transfer_requests;
delete from public.normalization_exceptions;
delete from public.permit_audit_log;

delete from public.shipping_profiles
where seller_id not in (select id from root_profiles);

delete from public.products
where seller_id not in (select id from root_profiles);

delete from public.production_teams
where owner_id not in (select id from root_profiles);

update public.gigs set permit_reviewed_by = null;
delete from public.gigs
where organizer_id not in (select id from root_profiles);

delete from public.groups
where owner_id not in (select id from root_profiles);

update public.studios set permit_reviewed_by = null;
delete from public.studios
where owner_id not in (select id from root_profiles);

delete from public.profiles
where id not in (select id from root_profiles);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','demo.mara.reyes.20260506@musikalokal.app',extensions.crypt('DemoPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"musician","full_name":"Mara Reyes","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','demo.kai.delacruz.20260506@musikalokal.app',extensions.crypt('DemoPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"musician","full_name":"Kai Dela Cruz","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','demo.joel.santos.20260506@musikalokal.app',extensions.crypt('DemoPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"studio-owner","full_name":"Joel Santos","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','demo.anya.cruz.20260506@musikalokal.app',extensions.crypt('DemoPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"venue-owner","full_name":"Anya Cruz","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000005','authenticated','authenticated','demo.lio.ramos.20260506@musikalokal.app',extensions.crypt('DemoPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"producer","full_name":"Lio Ramos","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000006','authenticated','authenticated','demo.nina.tan.20260506@musikalokal.app',extensions.crypt('DemoPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"fan","full_name":"Nina Tan","email_verified":true}'::jsonb,now(),now())
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  ('10000000-1000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"sub":"10000000-0000-4000-8000-000000000001","email":"demo.mara.reyes.20260506@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','{"sub":"10000000-0000-4000-8000-000000000002","email":"demo.kai.delacruz.20260506@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','{"sub":"10000000-0000-4000-8000-000000000003","email":"demo.joel.santos.20260506@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','{"sub":"10000000-0000-4000-8000-000000000004","email":"demo.anya.cruz.20260506@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','{"sub":"10000000-0000-4000-8000-000000000005","email":"demo.lio.ramos.20260506@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','{"sub":"10000000-0000-4000-8000-000000000006","email":"demo.nina.tan.20260506@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now())
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, email, full_name, avatar_url, role, bio, location, is_verified, verification_status, contact_number, address) values
  ('10000000-0000-4000-8000-000000000001','demo.mara.reyes.20260506@musikalokal.app','Mara Reyes','https://i.pravatar.cc/300?u=mara-reyes-demo','musician','Soul and jazz vocalist from Makati with a polished live-band set for weddings, launches, and lounge nights.','Makati City, Metro Manila',true,'APPROVED','+63 917 555 0101','Poblacion, Makati City'),
  ('10000000-0000-4000-8000-000000000002','demo.kai.delacruz.20260506@musikalokal.app','Kai Dela Cruz','https://i.pravatar.cc/300?u=kai-delacruz-demo','musician','Session guitarist and arranger covering indie, funk, worship, and pop sets around Metro Manila.','Quezon City, Metro Manila',true,'APPROVED','+63 917 555 0102','Diliman, Quezon City'),
  ('10000000-0000-4000-8000-000000000003','demo.joel.santos.20260506@musikalokal.app','Joel Santos','https://i.pravatar.cc/300?u=joel-santos-demo','studio-owner','Owner and engineer for two rehearsal and production rooms serving independent artists.','Mandaluyong City, Metro Manila',true,'APPROVED','+63 917 555 0103','Highway Hills, Mandaluyong City'),
  ('10000000-0000-4000-8000-000000000004','demo.anya.cruz.20260506@musikalokal.app','Anya Cruz','https://i.pravatar.cc/300?u=anya-cruz-demo','venue-owner','Curator for mid-size live rooms, brand showcases, listening parties, and community music nights.','Taguig City, Metro Manila',true,'APPROVED','+63 917 555 0104','BGC, Taguig City'),
  ('10000000-0000-4000-8000-000000000005','demo.lio.ramos.20260506@musikalokal.app','Lio Ramos','https://i.pravatar.cc/300?u=lio-ramos-demo','producer','Producer, merch seller, and release coordinator for indie pop and alternative acts.','Pasig City, Metro Manila',true,'APPROVED','+63 917 555 0105','Kapitolyo, Pasig City'),
  ('10000000-0000-4000-8000-000000000006','demo.nina.tan.20260506@musikalokal.app','Nina Tan','https://i.pravatar.cc/300?u=nina-tan-demo','fan','Frequent gig-goer and studio booker for hobby recording sessions and small private events.','San Juan City, Metro Manila',true,'APPROVED','+63 917 555 0106','Greenhills, San Juan City')
on conflict (id) do update set
  email=excluded.email, full_name=excluded.full_name, avatar_url=excluded.avatar_url, role=excluded.role,
  bio=excluded.bio, location=excluded.location, is_verified=excluded.is_verified,
  verification_status=excluded.verification_status, contact_number=excluded.contact_number, address=excluded.address;

insert into public.profile_skills (profile_id, skill) values
  ('10000000-0000-4000-8000-000000000001','vocals'),
  ('10000000-0000-4000-8000-000000000001','songwriting'),
  ('10000000-0000-4000-8000-000000000002','guitar'),
  ('10000000-0000-4000-8000-000000000002','arranging'),
  ('10000000-0000-4000-8000-000000000005','production')
on conflict do nothing;

insert into public.profile_genres (profile_id, genre) values
  ('10000000-0000-4000-8000-000000000001','soul'),
  ('10000000-0000-4000-8000-000000000001','jazz'),
  ('10000000-0000-4000-8000-000000000002','indie pop'),
  ('10000000-0000-4000-8000-000000000002','funk'),
  ('10000000-0000-4000-8000-000000000005','alternative pop')
on conflict do nothing;

insert into public.studios (id, owner_id, name, address, hourly_rate, description, latitude, longitude, rate, rehearsal_rate, recording_rate, pax, permit_status, studio_type) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Signal Room Makati','Poblacion, Makati City, Metro Manila',950,'Compact treated room for vocals, podcasts, and full-band rehearsal near the Makati nightlife district.',14.5657,121.0310,950,950,1800,8,'approved','recording'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Southline Rehearsal QC','Scout Rallos, Quezon City, Metro Manila',1200,'Spacious rehearsal studio with backline, upright piano, drum kit, and easy load-in for full bands.',14.6337,121.0352,1200,1200,2200,14,'approved','rehearsal')
on conflict (id) do nothing;

insert into public.studio_media (studio_id, media_type, media_url, sort_order) values
  ('20000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80',0),
  ('20000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=1200&q=80',1),
  ('20000000-0000-4000-8000-000000000002','image','https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80',0),
  ('20000000-0000-4000-8000-000000000002','image','https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=80',1);

insert into public.studio_amenities (studio_id, amenity) values
  ('20000000-0000-4000-8000-000000000001','Vocal booth'),
  ('20000000-0000-4000-8000-000000000001','Audio interface'),
  ('20000000-0000-4000-8000-000000000001','Air conditioning'),
  ('20000000-0000-4000-8000-000000000002','Drum kit'),
  ('20000000-0000-4000-8000-000000000002','Guitar amps'),
  ('20000000-0000-4000-8000-000000000002','Parking nearby');

insert into public.studio_types (studio_id, studio_type) values
  ('20000000-0000-4000-8000-000000000001','recording'),
  ('20000000-0000-4000-8000-000000000001','podcast'),
  ('20000000-0000-4000-8000-000000000002','rehearsal'),
  ('20000000-0000-4000-8000-000000000002','live-room');

insert into public.studio_instruments (studio_id, instrument_name, image_url) values
  ('20000000-0000-4000-8000-000000000001','Nord-style keys','https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=900&q=80'),
  ('20000000-0000-4000-8000-000000000002','Five-piece drum kit','https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&w=900&q=80'),
  ('20000000-0000-4000-8000-000000000002','Tube guitar amplifiers','https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?auto=format&fit=crop&w=900&q=80');

insert into public.studio_settings (studio_id, min_booking_duration_hours, max_booking_duration_hours, lead_time_hours, weekend_multiplier, recording_songs_per_block, recording_hours_per_block, recording_rate_negotiable) values
  ('20000000-0000-4000-8000-000000000001',2,8,12,1.15,1,3,false),
  ('20000000-0000-4000-8000-000000000002',2,10,6,1.10,1,3,true);

insert into public.studio_open_dates (studio_id, open_date, is_open) values
  ('20000000-0000-4000-8000-000000000001', current_date + 1, true),
  ('20000000-0000-4000-8000-000000000001', current_date + 2, true),
  ('20000000-0000-4000-8000-000000000002', current_date + 1, true),
  ('20000000-0000-4000-8000-000000000002', current_date + 3, true);

insert into public.groups (id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type, open_group_applications) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Baybayin Brass','Soul / Funk','Six-piece horn-forward party band for weddings, launches, and festival side stages.','Makati City, Metro Manila',14.5657,121.0310,28000,'band',true),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Neon Sampaguita','Indie Pop','Indie pop duo with guitar-led sets, synth pads, and intimate Tagalog originals.','Quezon City, Metro Manila',14.6337,121.0352,15000,'duo',true)
on conflict (id) do nothing;

insert into public.group_media (group_id, media_type, media_url, sort_order) values
  ('30000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',0),
  ('30000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80',1),
  ('30000000-0000-4000-8000-000000000002','image','https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80',0),
  ('30000000-0000-4000-8000-000000000002','image','https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1200&q=80',1);

insert into public.group_members (group_id, user_id, role) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','member')
on conflict do nothing;

insert into public.group_roster_members (group_id, user_id, member_name, member_role, instrument, avatar_url, sort_order) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Mara Reyes','Band lead','Vocals','https://i.pravatar.cc/300?u=mara-reyes-demo',0),
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Kai Dela Cruz','Arranger','Guitar','https://i.pravatar.cc/300?u=kai-delacruz-demo',1),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Kai Dela Cruz','Duo lead','Guitar','https://i.pravatar.cc/300?u=kai-delacruz-demo',0),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Mara Reyes','Featured vocalist','Vocals','https://i.pravatar.cc/300?u=mara-reyes-demo',1);

insert into public.group_availability_slots (group_id, slot_date, start_time, end_time, is_available) values
  ('30000000-0000-4000-8000-000000000001', current_date + 7, '18:00', '22:00', true),
  ('30000000-0000-4000-8000-000000000001', current_date + 14, '17:00', '23:00', true),
  ('30000000-0000-4000-8000-000000000002', current_date + 6, '19:00', '21:00', true);

insert into public.gigs (id, organizer_id, name, location, budget, description, event_date, status, latitude, longitude, rate, permit_status, reapplication_cooldown_days) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Warehouse 42 Live Sessions','BGC Arts Center Area, Taguig City',42000,'Saturday showcase for two OPM acts, one guest DJ, and a small merch corner.',current_timestamp + interval '18 days','open',14.5503,121.0472,42000,'approved',14),
  ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Harbor Rooftop Acoustic Night','Makati Avenue, Makati City',22000,'Intimate rooftop venue looking for acoustic and soul acts for a sunset brand event.',current_timestamp + interval '25 days','open',14.5657,121.0310,22000,'approved',7)
on conflict (id) do nothing;

insert into public.gig_media (gig_id, media_type, media_url, sort_order) values
  ('40000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',0),
  ('40000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=80',1),
  ('40000000-0000-4000-8000-000000000002','image','https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',0);

insert into public.gig_requirements (gig_id, requirement_key, requirement_value) values
  ('40000000-0000-4000-8000-000000000001','lineup','{"slots":2,"preferred_genres":["soul","funk","indie pop"]}'::jsonb),
  ('40000000-0000-4000-8000-000000000001','equipment','{"backline":true,"bring_instruments":true,"soundcheck":"15:00"}'::jsonb),
  ('40000000-0000-4000-8000-000000000002','lineup','{"slots":1,"preferred_genres":["acoustic","soul"]}'::jsonb);

insert into public.gig_availability_slots (gig_id, slot_date, start_time, end_time, is_available) values
  ('40000000-0000-4000-8000-000000000001', current_date + 18, '19:00', '23:00', true),
  ('40000000-0000-4000-8000-000000000002', current_date + 25, '17:00', '21:00', true);

insert into public.shipping_profiles (id, seller_id, name, shipping_type, base_fee, currency, estimated_days_min, estimated_days_max, regions, is_default) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','Metro Manila standard courier','standard',120,'PHP',2,4,array['PH-NCR','PH-III','PH-IVA'],true),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','Digital delivery','digital',0,'PHP',0,1,array['PH'],false)
on conflict (id) do nothing;

insert into public.products (id, seller_id, group_id, title, description, product_type, category, base_price, currency, status, is_featured, is_limited_edition, limited_quantity) values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','Baybayin Brass Tour Shirt','Heavy cotton black shirt with cream Baybayin Brass front print and tour-city back hit.','merch','apparel',850,'PHP','active',true,false,null),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002','Neon Sampaguita Demo Pack','Downloadable stems, lyric sheets, and two unreleased acoustic demos from the duo.','digital_drop','digital',350,'PHP','active',false,true,200),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Mara Reyes Live EP Poster','Signed A3 risograph-style poster from the live EP launch.','merch','poster',450,'PHP','active',false,true,75)
on conflict (id) do nothing;

insert into public.product_media (product_id, media_type, storage_path, mime_type, display_order, is_primary) values
  ('60000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80','image/jpeg',0,true),
  ('60000000-0000-4000-8000-000000000001','image','https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=80','image/jpeg',1,false),
  ('60000000-0000-4000-8000-000000000002','image','https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80','image/jpeg',0,true),
  ('60000000-0000-4000-8000-000000000003','image','https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=1200&q=80','image/jpeg',0,true);

insert into public.product_variants (product_id, variant_label, variant_type, price_override, sku, stock_quantity, is_available) values
  ('60000000-0000-4000-8000-000000000001','Small','size',850,'BB-TEE-S',18,true),
  ('60000000-0000-4000-8000-000000000001','Medium','size',850,'BB-TEE-M',24,true),
  ('60000000-0000-4000-8000-000000000001','Large','size',850,'BB-TEE-L',20,true),
  ('60000000-0000-4000-8000-000000000002','Digital bundle','format',350,'NS-DEMO-DIGI',200,true),
  ('60000000-0000-4000-8000-000000000003','Signed poster','edition',450,'MR-POSTER-SIGNED',75,true);

insert into public.studio_bookings (id, user_id, studio_id, booking_date, start_time, end_time, base_rate, hours, subtotal, modifiers_applied, final_price, notes, status, payment_status, payment_amount, payment_type, remaining_balance, session_type) values
  ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date + 2,'10:00','13:00',950,3,2850,'{"session_type":"recording"}'::jsonb,2850,'Lead vocal takes for live EP.','confirmed','paid',2850,'full',0,'recording'),
  ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',current_date + 3,'18:00','21:00',1200,3,3600,'{"session_type":"rehearsal"}'::jsonb,3600,'Full-band rehearsal before Warehouse 42 showcase.','pending','unpaid',0,'full',0,'rehearsal'),
  ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001',current_date + 5,'14:00','16:00',950,2,1900,'{"session_type":"recording"}'::jsonb,1900,'Podcast intro and vocal guide recording.','confirmed','partial',950,'downpayment',950,'recording'),
  ('70000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',current_date - 2,'11:00','14:00',1200,3,3600,'{"session_type":"rehearsal"}'::jsonb,3600,'Completed horn-section blocking rehearsal.','completed','paid',3600,'full',0,'rehearsal'),
  ('70000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','c1ccdc0a-da5c-b69d-ab03-a2a8c14843df',current_date + 6,'09:00','12:00',1200,3,3600,'{"session_type":"rehearsal","root_studio":true}'::jsonb,3600,'Demo booking against preserved One Roots Studio A.','confirmed','paid',3600,'full',0,'rehearsal');

insert into public.studio_booking_slots (booking_id, start_time, end_time, sort_order) values
  ('70000000-0000-4000-8000-000000000001','10:00','11:00',0),
  ('70000000-0000-4000-8000-000000000001','11:00','12:00',1),
  ('70000000-0000-4000-8000-000000000001','12:00','13:00',2),
  ('70000000-0000-4000-8000-000000000002','18:00','19:00',0),
  ('70000000-0000-4000-8000-000000000002','19:00','20:00',1),
  ('70000000-0000-4000-8000-000000000002','20:00','21:00',2),
  ('70000000-0000-4000-8000-000000000003','14:00','15:00',0),
  ('70000000-0000-4000-8000-000000000003','15:00','16:00',1),
  ('70000000-0000-4000-8000-000000000004','11:00','12:00',0),
  ('70000000-0000-4000-8000-000000000004','12:00','13:00',1),
  ('70000000-0000-4000-8000-000000000004','13:00','14:00',2),
  ('70000000-0000-4000-8000-000000000005','09:00','10:00',0),
  ('70000000-0000-4000-8000-000000000005','10:00','11:00',1),
  ('70000000-0000-4000-8000-000000000005','11:00','12:00',2);

insert into public.reviews (id, author_id, studio_id, rating, content, created_at, studio_booking_id) values
  ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',5,'Clean room, fast setup, and the backline was ready when we arrived.',now(),'70000000-0000-4000-8000-000000000004'),
  ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001',5,'Engineer was patient and the vocal booth felt polished.',now(),'70000000-0000-4000-8000-000000000003');

commit;
