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

delete from auth.identities
where user_id not in (select id from root_profiles);

delete from auth.users
where id not in (select id from root_profiles);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','juan.delacruz.20260514@musikalokal.app',extensions.crypt('MusikaPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"musician","full_name":"Juan Dela Cruz","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','mara.reyes.20260514@musikalokal.app',extensions.crypt('MusikaPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"musician","full_name":"Mara Reyes","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','joel.santos.20260514@musikalokal.app',extensions.crypt('MusikaPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"studio-owner","full_name":"Joel Santos","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','anya.cruz.20260514@musikalokal.app',extensions.crypt('MusikaPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"venue-owner","full_name":"Anya Cruz","email_verified":true}'::jsonb,now(),now()),
  ('10000000-0000-4000-8000-000000000005','authenticated','authenticated','lio.ramos.20260514@musikalokal.app',extensions.crypt('MusikaPass2026!', extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"role":"producer","full_name":"Lio Ramos","email_verified":true}'::jsonb,now(),now())
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  ('10000000-1000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"sub":"10000000-0000-4000-8000-000000000001","email":"juan.delacruz.20260514@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','{"sub":"10000000-0000-4000-8000-000000000002","email":"mara.reyes.20260514@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','{"sub":"10000000-0000-4000-8000-000000000003","email":"joel.santos.20260514@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','{"sub":"10000000-0000-4000-8000-000000000004","email":"anya.cruz.20260514@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now()),
  ('10000000-1000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','{"sub":"10000000-0000-4000-8000-000000000005","email":"lio.ramos.20260514@musikalokal.app","email_verified":true,"phone_verified":false}'::jsonb,'email',now(),now(),now())
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, email, full_name, avatar_url, role, bio, location, is_verified, verification_status, contact_number, address) values
  ('10000000-0000-4000-8000-000000000001','juan.delacruz.20260514@musikalokal.app','Juan Dela Cruz','https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=600','musician','Malolos guitarist and arranger who plays OPM, funk, and wedding reception sets with a tight trio or full band.','Malolos City, Bulacan',true,'APPROVED','+63 917 555 0101','Barangay Tikay, Malolos City, Bulacan'),
  ('10000000-0000-4000-8000-000000000002','mara.reyes.20260514@musikalokal.app','Mara Reyes','https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=600','musician','Soul and jazz vocalist from Baliwag with a polished live-band set for weddings, launches, and lounge nights.','Baliwag City, Bulacan',true,'APPROVED','+63 917 555 0102','Poblacion, Baliwag City, Bulacan'),
  ('10000000-0000-4000-8000-000000000003','joel.santos.20260514@musikalokal.app','Joel Santos','https://images.pexels.com/photos/7586137/pexels-photo-7586137.jpeg?auto=compress&cs=tinysrgb&w=600','studio-owner','Owner and engineer for rehearsal, recording, and voice-over rooms serving independent artists.','Mandaluyong City, Metro Manila',true,'APPROVED','+63 917 555 0103','Highway Hills, Mandaluyong City'),
  ('10000000-0000-4000-8000-000000000004','anya.cruz.20260514@musikalokal.app','Anya Cruz','https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=600','venue-owner','Curator for mid-size live rooms, brand showcases, listening parties, and community music nights.','Taguig City, Metro Manila',true,'APPROVED','+63 917 555 0104','BGC, Taguig City'),
  ('10000000-0000-4000-8000-000000000005','lio.ramos.20260514@musikalokal.app','Lio Ramos','https://images.pexels.com/photos/29990037/pexels-photo-29990037.jpeg?auto=compress&cs=tinysrgb&w=600','producer','Producer, merch seller, and release coordinator for indie pop and alternative acts.','Pasig City, Metro Manila',true,'APPROVED','+63 917 555 0105','Kapitolyo, Pasig City')
on conflict (id) do update set
  email=excluded.email, full_name=excluded.full_name, avatar_url=excluded.avatar_url, role=excluded.role,
  bio=excluded.bio, location=excluded.location, is_verified=excluded.is_verified,
  verification_status=excluded.verification_status, contact_number=excluded.contact_number, address=excluded.address;

insert into public.profile_skills (profile_id, skill) values
  ('10000000-0000-4000-8000-000000000001','guitar'),
  ('10000000-0000-4000-8000-000000000001','arranging'),
  ('10000000-0000-4000-8000-000000000002','vocals'),
  ('10000000-0000-4000-8000-000000000002','songwriting'),
  ('10000000-0000-4000-8000-000000000005','production')
on conflict do nothing;

insert into public.profile_genres (profile_id, genre) values
  ('10000000-0000-4000-8000-000000000001','indie pop'),
  ('10000000-0000-4000-8000-000000000001','funk'),
  ('10000000-0000-4000-8000-000000000002','soul'),
  ('10000000-0000-4000-8000-000000000002','jazz'),
  ('10000000-0000-4000-8000-000000000005','alternative pop')
on conflict do nothing;

insert into public.studios (id, owner_id, name, address, hourly_rate, description, latitude, longitude, rate, rehearsal_rate, recording_rate, pax, permit_status, studio_type) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Signal Room Makati','Poblacion, Makati City, Metro Manila',950,'Compact treated room for vocals, podcasts, and full-band rehearsal near the Makati nightlife district.',14.5657,121.0310,950,950,1800,8,'approved','recording'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Southline Rehearsal QC','Scout Rallos, Quezon City, Metro Manila',1200,'Spacious rehearsal studio with backline, upright piano, drum kit, and easy load-in for full bands.',14.6337,121.0352,1200,1200,2200,14,'approved','rehearsal'),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Harana Room San Juan','Wilson Street, San Juan City, Metro Manila',850,'Warm vocal room with small control booth for acoustic sessions, jingles, and guide-track recording.',14.6019,121.0355,850,850,1600,6,'approved','recording'),
  ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','Northbank Live Room','Marikina Riverbanks, Marikina City, Metro Manila',1350,'Tall-ceiling rehearsal room with live drums, keyboard stand, and enough floor space for horn sections.',14.6320,121.0851,1350,1350,2400,16,'approved','rehearsal'),
  ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000003','Casa A Tempo Alabang','Madrigal Avenue, Muntinlupa City, Metro Manila',1100,'Quiet south-side studio for worship teams, singer-songwriters, voice lessons, and content shoots.',14.4230,121.0320,1100,1100,2100,10,'approved','recording')
on conflict (id) do nothing;

insert into public.studio_media (studio_id, media_type, media_url, sort_order) values
  ('20000000-0000-4000-8000-000000000001','image','https://images.pexels.com/photos/7586137/pexels-photo-7586137.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('20000000-0000-4000-8000-000000000002','image','https://images.pexels.com/photos/995301/pexels-photo-995301.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('20000000-0000-4000-8000-000000000003','image','https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=1200&q=80',0),
  ('20000000-0000-4000-8000-000000000004','image','https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('20000000-0000-4000-8000-000000000005','image','https://images.pexels.com/photos/164829/pexels-photo-164829.jpeg?auto=compress&cs=tinysrgb&w=1200',0);

insert into public.studio_amenities (studio_id, amenity) values
  ('20000000-0000-4000-8000-000000000001','Vocal booth'),
  ('20000000-0000-4000-8000-000000000002','Drum kit'),
  ('20000000-0000-4000-8000-000000000003','Condenser microphones'),
  ('20000000-0000-4000-8000-000000000004','Backline amps'),
  ('20000000-0000-4000-8000-000000000005','Content lighting');

insert into public.studio_types (studio_id, studio_type) values
  ('20000000-0000-4000-8000-000000000001','recording'),
  ('20000000-0000-4000-8000-000000000002','rehearsal'),
  ('20000000-0000-4000-8000-000000000003','recording'),
  ('20000000-0000-4000-8000-000000000004','live-room'),
  ('20000000-0000-4000-8000-000000000005','recording');

insert into public.studio_instruments (studio_id, instrument_name, image_url) values
  ('20000000-0000-4000-8000-000000000001','Weighted stage keys','https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=900&q=80'),
  ('20000000-0000-4000-8000-000000000002','Five-piece drum kit','https://images.pexels.com/photos/995301/pexels-photo-995301.jpeg?auto=compress&cs=tinysrgb&w=900'),
  ('20000000-0000-4000-8000-000000000003','Acoustic guitar pair','https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=900'),
  ('20000000-0000-4000-8000-000000000004','Tube guitar amplifiers','https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&cs=tinysrgb&w=900'),
  ('20000000-0000-4000-8000-000000000005','Compact percussion kit','https://images.pexels.com/photos/995301/pexels-photo-995301.jpeg?auto=compress&cs=tinysrgb&w=900');

insert into public.studio_settings (studio_id, min_booking_duration_hours, max_booking_duration_hours, lead_time_hours, weekend_multiplier, recording_songs_per_block, recording_hours_per_block, recording_rate_negotiable) values
  ('20000000-0000-4000-8000-000000000001',2,8,12,1.15,1,3,false),
  ('20000000-0000-4000-8000-000000000002',2,10,6,1.10,1,3,true),
  ('20000000-0000-4000-8000-000000000003',1,6,8,1.05,1,2,true),
  ('20000000-0000-4000-8000-000000000004',2,10,10,1.10,1,3,false),
  ('20000000-0000-4000-8000-000000000005',2,8,12,1.20,1,3,true);

insert into public.studio_open_dates (studio_id, open_date, is_open) values
  ('20000000-0000-4000-8000-000000000001', current_date + 1, true),
  ('20000000-0000-4000-8000-000000000002', current_date + 2, true),
  ('20000000-0000-4000-8000-000000000003', current_date + 3, true),
  ('20000000-0000-4000-8000-000000000004', current_date + 4, true),
  ('20000000-0000-4000-8000-000000000005', current_date + 5, true);

insert into public.studio_operating_hours (studio_id, day_of_week, is_open, open_time, close_time, slot_order, reason) values
  ('20000000-0000-4000-8000-000000000001',1,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000001',2,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000001',3,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000001',4,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000001',5,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000002',1,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000002',2,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000002',3,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000002',4,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000002',5,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000003',1,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000003',2,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000003',3,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000003',4,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000003',5,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000004',1,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000004',2,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000004',3,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000004',4,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000004',5,true,'12:00','22:00',0,'Rehearsal hours'),
  ('20000000-0000-4000-8000-000000000005',1,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000005',2,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000005',3,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000005',4,true,'10:00','18:00',0,'Recording hours'),
  ('20000000-0000-4000-8000-000000000005',5,true,'10:00','18:00',0,'Recording hours');

insert into public.studio_date_overrides (studio_id, override_date, is_open, open_time, close_time, slot_order, reason) values
  ('20000000-0000-4000-8000-000000000001', current_date + 1, true, '10:00', '18:00', 0, 'Recording date'),
  ('20000000-0000-4000-8000-000000000002', current_date + 2, true, '12:00', '22:00', 0, 'Rehearsal date'),
  ('20000000-0000-4000-8000-000000000003', current_date + 3, true, '10:00', '18:00', 0, 'Recording date'),
  ('20000000-0000-4000-8000-000000000004', current_date + 4, true, '12:00', '22:00', 0, 'Rehearsal date'),
  ('20000000-0000-4000-8000-000000000005', current_date + 5, true, '10:00', '18:00', 0, 'Recording date')
on conflict (studio_id, override_date, slot_order) do update set
  is_open = excluded.is_open,
  open_time = excluded.open_time,
  close_time = excluded.close_time,
  reason = excluded.reason;

insert into public.groups (id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type, open_group_applications) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Sampaguita Drive','Indie Funk','Four-piece Bulacan band playing guitar-led OPM, funk grooves, and wedding reception medleys.','Malolos City, Bulacan',14.8527,120.8160,24000,'band',true),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Baliwag Jazz Collective','Soul / Jazz','Lounge-ready Bulacan soul and jazz collective with Tagalog standards, bossa sets, and quiet-dinner arrangements.','Baliwag City, Bulacan',14.9547,120.8969,18000,'band',true),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Malolos Night Market','Alt Rock','Guitar-forward Bulacan alt-rock crew with 90s OPM covers and two-set bar programs.','Malolos City, Bulacan',14.8527,120.8160,22000,'band',true),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Muni Muni Strings','Acoustic OPM','Acoustic Bulacan duo built for garden weddings, listening rooms, and proposal dinners.','Angat, Bulacan',14.9285,121.0309,14000,'duo',true),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Bulacan Brass Club','Soul / Funk','Horn-backed Bulacan party band for brand launches, city festivals, and late-night dance sets.','Bocaue, Bulacan',14.7983,120.9261,32000,'band',true)
on conflict (id) do nothing;

insert into public.group_media (group_id, media_type, media_url, sort_order) values
  ('30000000-0000-4000-8000-000000000001','image','https://images.pexels.com/photos/33284931/pexels-photo-33284931.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('30000000-0000-4000-8000-000000000002','image','https://images.pexels.com/photos/9419244/pexels-photo-9419244.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('30000000-0000-4000-8000-000000000003','image','https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('30000000-0000-4000-8000-000000000004','image','https://images.pexels.com/photos/32527855/pexels-photo-32527855.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('30000000-0000-4000-8000-000000000005','image','https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=1200',0);

insert into public.group_members (group_id, user_id, role) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner'),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','owner'),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','owner'),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','owner')
on conflict do nothing;

insert into public.group_roster_members (group_id, user_id, member_name, member_role, instrument, avatar_url, sort_order) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Juan Dela Cruz','Band lead','Guitar','https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=600',0),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Mara Reyes','Band lead','Vocals','https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=600',0),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Juan Dela Cruz','Lead guitar','Guitar','https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=600',0),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Mara Reyes','Vocal lead','Vocals','https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=600',0),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Juan Dela Cruz','Rhythm director','Guitar','https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=600',0);

insert into public.group_availability_slots (group_id, slot_date, start_time, end_time, is_available) values
  ('30000000-0000-4000-8000-000000000001', current_date + 7, '18:00', '22:00', true),
  ('30000000-0000-4000-8000-000000000002', current_date + 8, '19:00', '22:00', true),
  ('30000000-0000-4000-8000-000000000003', current_date + 9, '20:00', '23:00', true),
  ('30000000-0000-4000-8000-000000000004', current_date + 10, '17:00', '20:00', true),
  ('30000000-0000-4000-8000-000000000005', current_date + 11, '19:00', '23:00', true);

insert into public.gigs (id, organizer_id, name, location, budget, description, event_date, status, latitude, longitude, rate, permit_status, reapplication_cooldown_days) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Warehouse 42 Live Sessions','BGC Arts Center Area, Taguig City',42000,'Saturday showcase for two OPM acts, one guest DJ, and a small merch corner.',current_timestamp + interval '18 days','open',14.5503,121.0472,42000,'approved',14),
  ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Harbor Rooftop Acoustic Night','Makati Avenue, Makati City',22000,'Intimate rooftop gig looking for acoustic and soul acts for a sunset brand event.',current_timestamp + interval '25 days','open',14.5657,121.0310,22000,'approved',7),
  ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','Escolta Courtyard Vinyl Fair','First United Building Courtyard, Escolta, Manila',30000,'Late-afternoon record fair needing a compact live band with original OPM songs and a clean 45-minute set.',current_timestamp + interval '32 days','open',14.5995,120.9736,30000,'approved',10),
  ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Tagaytay Garden Reception','Tagaytay Highlands Road, Cavite',36000,'Outdoor wedding reception needing an acoustic-to-full-band arc from cocktails to last dance.',current_timestamp + interval '40 days','open',14.1153,120.9621,36000,'approved',10),
  ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','Ortigas Product Launch Set','ADB Avenue, Ortigas Center, Pasig',28000,'Corporate launch looking for a polished 30-minute opener and short walk-in playlist handoff.',current_timestamp + interval '45 days','open',14.5869,121.0614,28000,'approved',14)
on conflict (id) do nothing;

insert into public.gig_media (gig_id, media_type, media_url, sort_order) values
  ('40000000-0000-4000-8000-000000000001','image','https://images.pexels.com/photos/29990037/pexels-photo-29990037.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('40000000-0000-4000-8000-000000000002','image','https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('40000000-0000-4000-8000-000000000003','image','https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('40000000-0000-4000-8000-000000000004','image','https://images.pexels.com/photos/32527855/pexels-photo-32527855.jpeg?auto=compress&cs=tinysrgb&w=1200',0),
  ('40000000-0000-4000-8000-000000000005','image','https://images.pexels.com/photos/164829/pexels-photo-164829.jpeg?auto=compress&cs=tinysrgb&w=1200',0);

insert into public.gig_requirements (gig_id, requirement_key, requirement_value) values
  ('40000000-0000-4000-8000-000000000001','lineup','{"slots":2,"preferred_genres":["soul","funk","indie pop"]}'::jsonb),
  ('40000000-0000-4000-8000-000000000002','lineup','{"slots":1,"preferred_genres":["acoustic","soul"]}'::jsonb),
  ('40000000-0000-4000-8000-000000000003','lineup','{"slots":1,"preferred_genres":["opm","indie pop","funk"]}'::jsonb),
  ('40000000-0000-4000-8000-000000000004','lineup','{"slots":1,"preferred_genres":["acoustic","pop ballad"]}'::jsonb),
  ('40000000-0000-4000-8000-000000000005','lineup','{"slots":1,"preferred_genres":["pop","soul","jazz"]}'::jsonb);

insert into public.gig_availability_slots (gig_id, slot_date, start_time, end_time, is_available) values
  ('40000000-0000-4000-8000-000000000001', current_date + 18, '19:00', '23:00', true),
  ('40000000-0000-4000-8000-000000000002', current_date + 25, '17:00', '21:00', true),
  ('40000000-0000-4000-8000-000000000003', current_date + 32, '16:00', '20:00', true),
  ('40000000-0000-4000-8000-000000000004', current_date + 40, '16:00', '23:00', true),
  ('40000000-0000-4000-8000-000000000005', current_date + 45, '18:00', '21:00', true);

insert into public.shipping_profiles (id, seller_id, name, shipping_type, base_fee, currency, estimated_days_min, estimated_days_max, regions, is_default) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','Metro Manila standard courier','standard',120,'PHP',2,4,array['PH-NCR','PH-III','PH-IVA'],true),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','Digital delivery','digital',0,'PHP',0,1,array['PH'],false),
  ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','Luzon merch courier','standard',180,'PHP',3,6,array['PH-I','PH-II','PH-III','PH-CAR'],false),
  ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','Gig pickup table','pickup',0,'PHP',0,1,array['PH-NCR'],false),
  ('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','Signed goods courier','standard',150,'PHP',2,5,array['PH-NCR','PH-IVA'],false)
on conflict (id) do nothing;

insert into public.products (id, seller_id, group_id, title, description, product_type, category, base_price, currency, status, is_featured, is_limited_edition, limited_quantity) values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','Sampaguita Drive Tour Shirt','Heavy cotton black shirt with cream Sampaguita Drive front print and Bulacan back hit.','merch','apparel',850,'PHP','active',true,false,null),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002','Baliwag Jazz Collective Stem Pack','Downloadable stems, lyric sheets, and two unreleased live-room cuts from the collective.','digital_drop','digital',350,'PHP','active',false,true,200),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','Sampaguita Drive Gig Poster','Signed A3 risograph-style poster from the Escolta courtyard set.','merch','poster',450,'PHP','active',false,true,75),
  ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002','Baliwag Jazz Collective Lyric Zine','Sixteen-page risograph zine with lyric notes, set photos, and chord sketches.','merch','poster',520,'PHP','active',false,true,60),
  ('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','Bulacan Brass Club Patch Set','Five embroidered patches for jackets, cases, and pedalboard bags.','merch','accessories',390,'PHP','active',true,false,null)
on conflict (id) do nothing;

insert into public.product_media (product_id, media_type, storage_path, mime_type, display_order, is_primary) values
  ('60000000-0000-4000-8000-000000000001','image','https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',0,true),
  ('60000000-0000-4000-8000-000000000002','image','https://images.pexels.com/photos/164821/pexels-photo-164821.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',0,true),
  ('60000000-0000-4000-8000-000000000003','image','https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=1200&q=80','image/jpeg',0,true),
  ('60000000-0000-4000-8000-000000000004','image','https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',0,true),
  ('60000000-0000-4000-8000-000000000005','image','https://images.pexels.com/photos/1152077/pexels-photo-1152077.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',0,true);

insert into public.product_variants (product_id, variant_label, variant_type, price_override, sku, stock_quantity, is_available) values
  ('60000000-0000-4000-8000-000000000001','Medium','size',850,'SD-TEE-M',24,true),
  ('60000000-0000-4000-8000-000000000002','Digital bundle','format',350,'BJC-STEMS-DIGI',200,true),
  ('60000000-0000-4000-8000-000000000003','Signed poster','edition',450,'SD-POSTER-SIGNED',75,true),
  ('60000000-0000-4000-8000-000000000004','Numbered zine','edition',520,'BJC-ZINE-NUM',60,true),
  ('60000000-0000-4000-8000-000000000005','Patch bundle','format',390,'PBC-PATCH-SET',120,true);

insert into public.playlists (id, creator_id, title, description, cover_image_url, visibility, genre, is_featured) values
  ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Sikatuna Sunset Set','Warm OPM and indie-funk tracks Juan uses before small-room shows.','https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=1200','public','Indie Funk',true),
  ('a0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Poblacion After Hours','Soul, jazz, and bossa picks for late lounge sets.','https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=1200','public','Soul / Jazz',true),
  ('a0000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','Stagecraft Call Time','Producer playlist for walk-in music, soundcheck references, and quick changeovers.','https://images.pexels.com/photos/7586137/pexels-photo-7586137.jpeg?auto=compress&cs=tinysrgb&w=1200','public','Event Pop',false),
  ('a0000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Malolos Guitar Notes','Alt-rock riffs and rehearsal references from the Bulacan room circuit.','https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&cs=tinysrgb&w=1200','public','Alt Rock',false),
  ('a0000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Garden Reception Warmup','Acoustic OPM and first-dance references for outdoor receptions.','https://images.pexels.com/photos/32527855/pexels-photo-32527855.jpeg?auto=compress&cs=tinysrgb&w=1200','promotional','Acoustic OPM',false)
on conflict (id) do nothing;

insert into public.playlist_items (id, playlist_id, title, artist_name, duration_seconds, "position", audio_url) values
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Sikatuna Sundown','Juan Dela Cruz',231,0,'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
  ('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','Late Jeepney Bossa','Baliwag Jazz Collective',204,0,'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'),
  ('a1000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003','Lights Up at Seven','Poblacion Stagecraft',218,0,'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'),
  ('a1000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000004','Aurora Pedalboard','Malolos Night Market',246,0,'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'),
  ('a1000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005','First Dance by the Pines','Muni Muni Strings',192,0,'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3')
on conflict (id) do nothing;

insert into public.playlist_teaser_assets (id, playlist_id, uploader_id, asset_type, storage_path, mime_type, duration_seconds, file_size_bytes, screen_result) values
  ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','cover_art','https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',null,null,'passed'),
  ('a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','cover_art','https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',null,null,'passed'),
  ('a2000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','cover_art','https://images.pexels.com/photos/7586137/pexels-photo-7586137.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',null,null,'passed'),
  ('a2000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','cover_art','https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',null,null,'passed'),
  ('a2000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','cover_art','https://images.pexels.com/photos/32527855/pexels-photo-32527855.jpeg?auto=compress&cs=tinysrgb&w=1200','image/jpeg',null,null,'passed')
on conflict (id) do nothing;

insert into public.group_playlists (id, group_id, playlist_id, "position") values
  ('a3000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',0),
  ('a3000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',0),
  ('a3000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004',0),
  ('a3000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005',0),
  ('a3000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000003',0)
on conflict do nothing;

insert into public.playlist_play_events (playlist_id, item_id, user_id, event_type, platform) values
  ('a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','teaser_play','mobile'),
  ('a0000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','outbound_click','web'),
  ('a0000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','teaser_play','mobile'),
  ('a0000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','outbound_click','web'),
  ('a0000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','teaser_play','mobile');

insert into public.production_teams (id, owner_id, name, description, logo_url) values
  ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','Poblacion Stagecraft','Producer-led crew handling live session lineups, backline coordination, release shoots, and small gig takeovers around Metro Manila.','https://images.pexels.com/photos/7586137/pexels-photo-7586137.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','Escolta Audio Bureau','Production desk for heritage-building shows, record fairs, and street-level listening parties.','https://images.pexels.com/photos/29990037/pexels-photo-29990037.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','South Signal Crew','Lean crew for launch events, acoustic livestreams, and brand pop-ups south of Manila.','https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('90000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','Northbank Sessions','Marikina-focused production team for full-band rehearsals, riverfront shows, and campus events.','https://images.pexels.com/photos/33284931/pexels-photo-33284931.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('90000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','Garden Set Collective','Wedding and garden-party production team handling acoustic stages, call sheets, and reception cues.','https://images.pexels.com/photos/32527855/pexels-photo-32527855.jpeg?auto=compress&cs=tinysrgb&w=1200')
on conflict (id) do update set
  owner_id = excluded.owner_id,
  name = excluded.name,
  description = excluded.description,
  logo_url = excluded.logo_url,
  updated_at = timezone('utc'::text, now());

insert into public.production_team_members (team_id, user_id, role) values
  ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','owner'),
  ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','owner'),
  ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','owner'),
  ('90000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','owner'),
  ('90000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','owner')
on conflict (team_id, user_id) do update set role = excluded.role;

insert into public.production_team_roster (id, team_id, entity_kind, profile_id, group_id, added_by_user_id) values
  ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','musician','10000000-0000-4000-8000-000000000001',null,'10000000-0000-4000-8000-000000000005'),
  ('91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','group',null,'30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005'),
  ('91000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000003','group',null,'30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005'),
  ('91000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000004','group',null,'30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005'),
  ('91000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000005','duo',null,'30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

insert into public.gig_applications (
  id, applicant_id, group_id, gig_id, pitch_message, video_url, status, cv_url,
  is_solo_application, slot_type, submitted_by_user_id, leader_approval_status,
  leader_reviewed_at, production_team_id, production_roster_id, note
) values
  ('92000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','Sampaguita Drive can bring a compact OPM and funk set with a clean stage plot for the Escolta courtyard fair.','https://www.youtube.com/watch?v=3JZ_D3ELwOQ','pending','https://musikalokal.app/press/sampaguita-drive-epk.pdf',false,'band','10000000-0000-4000-8000-000000000001','approved',timezone('utc'::text, now()),null,null,'Direct band application for gig owner review.'),
  ('92000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',null,'40000000-0000-4000-8000-000000000002','Mara can perform a stripped-down soul set with keys and guitar support for the rooftop sunset program.','https://www.youtube.com/watch?v=oHg5SJYRHA0','accepted','https://musikalokal.app/press/mara-reyes-epk.pdf',true,'solo','10000000-0000-4000-8000-000000000002',null,null,null,null,'Accepted solo application for musician booking history.'),
  ('92000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','Escolta Audio Bureau can coordinate Baliwag Jazz Collective with backline, call sheets, and settlement handled by the production team.','https://www.youtube.com/watch?v=9bZkp7q19f0','pending','https://musikalokal.app/press/escolta-audio-roster.pdf',false,'band','10000000-0000-4000-8000-000000000005',null,null,'90000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','Production team application with roster details.'),
  ('92000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000005','Malolos Night Market can deliver a tight 30-minute opener with a clean corporate set list.','https://www.youtube.com/watch?v=3JZ_D3ELwOQ','approved','https://musikalokal.app/press/malolos-night-market.pdf',false,'band','10000000-0000-4000-8000-000000000001','approved',timezone('utc'::text, now()),null,null,'Approved band application for upcoming activity.'),
  ('92000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','Garden Set Collective can handle Muni Muni Strings for cocktail hour and first-dance cues.','https://www.youtube.com/watch?v=oHg5SJYRHA0','completed','https://musikalokal.app/press/garden-set-collective.pdf',false,'duo','10000000-0000-4000-8000-000000000005',null,null,'90000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000005','Completed production application for history and review activity.')
on conflict (id) do update set
  applicant_id = excluded.applicant_id,
  group_id = excluded.group_id,
  gig_id = excluded.gig_id,
  pitch_message = excluded.pitch_message,
  video_url = excluded.video_url,
  status = excluded.status,
  cv_url = excluded.cv_url,
  is_solo_application = excluded.is_solo_application,
  slot_type = excluded.slot_type,
  submitted_by_user_id = excluded.submitted_by_user_id,
  leader_approval_status = excluded.leader_approval_status,
  leader_reviewed_at = excluded.leader_reviewed_at,
  production_team_id = excluded.production_team_id,
  production_roster_id = excluded.production_roster_id,
  note = excluded.note,
  updated_at = timezone('utc'::text, now());

insert into public.booking_requests (id, sender_id, receiver_id, group_id, studio_id, message, status, attachment_url, event_details) values
  ('92500000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',null,null,'Poblacion Stagecraft invited Juan Dela Cruz to manage guitar-heavy live session rosters.','accepted','https://musikalokal.app/contracts/poblacion-stagecraft-juan.pdf','{"type":"listing_connection_request","sender_entity_type":"production_team","sender_entity_id":"90000000-0000-4000-8000-000000000001","sender_entity_name":"Poblacion Stagecraft","receiver_entity_type":"musician","receiver_entity_id":"10000000-0000-4000-8000-000000000001","receiver_entity_name":"Juan Dela Cruz","production_team_id":"90000000-0000-4000-8000-000000000001","request_kind":"invite","source":"seed_20260514","route":"/bookings","route_params":{"tab":"Pending"},"request_details":{"context_label":"Production roster invite","roster_entry_name":"Juan Dela Cruz","roster_entry_kind":"musician"}}'::jsonb),
  ('92500000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002',null,null,'Escolta Audio Bureau invited Mara Reyes for heritage-building listening room dates.','pending','https://musikalokal.app/contracts/escolta-audio-mara.pdf','{"type":"listing_connection_request","sender_entity_type":"production_team","sender_entity_id":"90000000-0000-4000-8000-000000000002","sender_entity_name":"Escolta Audio Bureau","receiver_entity_type":"musician","receiver_entity_id":"10000000-0000-4000-8000-000000000002","receiver_entity_name":"Mara Reyes","production_team_id":"90000000-0000-4000-8000-000000000002","request_kind":"invite","source":"seed_20260514","route":"/bookings","route_params":{"tab":"Pending"},"request_details":{"context_label":"Production roster invite","roster_entry_name":"Mara Reyes","roster_entry_kind":"musician"}}'::jsonb),
  ('92500000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001',null,'Sampaguita Drive applied to join Poblacion Stagecraft for stage-ready indie funk sets.','pending','https://musikalokal.app/press/sampaguita-drive-roster.pdf','{"type":"listing_connection_request","sender_entity_type":"group","sender_entity_id":"30000000-0000-4000-8000-000000000001","sender_entity_name":"Sampaguita Drive","receiver_entity_type":"production_team","receiver_entity_id":"90000000-0000-4000-8000-000000000001","receiver_entity_name":"Poblacion Stagecraft","production_team_id":"90000000-0000-4000-8000-000000000001","request_kind":"application","source":"seed_20260514","route":"/bookings","route_params":{"tab":"Pending"},"request_details":{"context_label":"Roster application","roster_entry_name":"Sampaguita Drive","roster_entry_kind":"group","slot_type":"band"}}'::jsonb),
  ('92500000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005',null,null,'Anya Cruz invited Garden Set Collective to propose acoustic production for a Tagaytay reception.','approved','https://musikalokal.app/contracts/tagaytay-garden-set.pdf','{"type":"listing_connection_request","sender_entity_type":"venue","sender_entity_id":"40000000-0000-4000-8000-000000000004","sender_entity_name":"Tagaytay Garden Reception","receiver_entity_type":"production_team","receiver_entity_id":"90000000-0000-4000-8000-000000000005","receiver_entity_name":"Garden Set Collective","production_team_id":"90000000-0000-4000-8000-000000000005","request_kind":"invite","source":"seed_20260514","route":"/bookings","route_params":{"tab":"Pending"},"request_details":{"context_label":"Gig invite","slot_type":"duo"}}'::jsonb),
  ('92500000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004',null,'Muni Muni Strings invited Juan to support garden reception guitar arrangements.','declined','https://musikalokal.app/contracts/muni-muni-juan.pdf','{"type":"listing_connection_request","sender_entity_type":"group","sender_entity_id":"30000000-0000-4000-8000-000000000004","sender_entity_name":"Muni Muni Strings","receiver_entity_type":"musician","receiver_entity_id":"10000000-0000-4000-8000-000000000001","receiver_entity_name":"Juan Dela Cruz","request_kind":"invite","source":"seed_20260514","route":"/bookings","route_params":{"tab":"History"},"request_details":{"context_label":"Group invite","roster_entry_name":"Juan Dela Cruz","roster_entry_kind":"musician","slot_type":"guitar"}}'::jsonb);

insert into public.studio_bookings (id, user_id, studio_id, booking_date, start_time, end_time, base_rate, hours, subtotal, modifiers_applied, final_price, notes, status, payment_status, payment_amount, payment_type, remaining_balance, session_type) values
  ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date + 2,'10:00','13:00',950,3,2850,'{"session_type":"recording"}'::jsonb,2850,'Lead guitar overdubs for Sikatuna Sundown.','confirmed','paid',2850,'full',0,'recording'),
  ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',current_date + 3,'18:00','21:00',1200,3,3600,'{"session_type":"rehearsal"}'::jsonb,3600,'Quartet rehearsal before Warehouse 42.','pending','unpaid',0,'full',0,'rehearsal'),
  ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',current_date + 5,'14:00','16:00',850,2,1700,'{"session_type":"recording"}'::jsonb,1700,'Acoustic guide recording for a reception set.','confirmed','partial',850,'downpayment',850,'recording'),
  ('70000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004',current_date - 2,'11:00','14:00',1350,3,4050,'{"session_type":"rehearsal"}'::jsonb,4050,'Completed horn-section blocking rehearsal.','completed','paid',4050,'full',0,'rehearsal'),
  ('70000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005',current_date + 6,'09:00','12:00',1100,3,3300,'{"session_type":"recording"}'::jsonb,3300,'Voice-over and guitar content for playlist rollout.','confirmed','paid',3300,'full',0,'recording');

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

insert into public.notifications (id, user_id, type, title, message, read, image, meta) values
  ('93000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','info','New group application','Sampaguita Drive applied to Escolta Courtyard Vinyl Fair.',false,'https://images.pexels.com/photos/33284931/pexels-photo-33284931.jpeg?auto=compress&cs=tinysrgb&w=800','{"source":"seed_20260514","type":"gig_application","application_id":"92000000-0000-4000-8000-000000000001","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','info','New production application','Poblacion Stagecraft applied to Warehouse 42 Live Sessions.',false,'https://images.pexels.com/photos/7586137/pexels-photo-7586137.jpeg?auto=compress&cs=tinysrgb&w=800','{"source":"seed_20260514","type":"gig_application","application_id":"92000000-0000-4000-8000-000000000003","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','info','Production roster connected','Juan Dela Cruz is now on the Poblacion Stagecraft roster.',true,'https://images.pexels.com/photos/92080/pexels-photo-92080.jpeg?auto=compress&cs=tinysrgb&w=800','{"source":"seed_20260514","type":"listing_connection_request","request_id":"92500000-0000-4000-8000-000000000001","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','info','Production roster invite','Escolta Audio Bureau invited Mara Reyes for listening room dates.',false,'https://images.pexels.com/photos/29990037/pexels-photo-29990037.jpeg?auto=compress&cs=tinysrgb&w=800','{"source":"seed_20260514","type":"listing_connection_request","request_id":"92500000-0000-4000-8000-000000000002","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','info','Gig invite accepted','Garden Set Collective is approved for Tagaytay Garden Reception.',true,'https://images.pexels.com/photos/32527855/pexels-photo-32527855.jpeg?auto=compress&cs=tinysrgb&w=800','{"source":"seed_20260514","type":"listing_connection_request","request_id":"92500000-0000-4000-8000-000000000004","route":"/bookings"}'::jsonb);

insert into public.reviews (id, author_id, studio_id, rating, content, created_at, studio_booking_id) values
  ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',5,'Clean vocal chain and quick file handoff after the session.',now(),'70000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',5,'The live room felt balanced and the drum kit was ready.',now(),'70000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',4,'Warm room tone for acoustic guitar and fast setup.',now(),'70000000-0000-4000-8000-000000000003'),
  ('80000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004',5,'Enough space for the full ensemble and clean monitor mixes.',now(),'70000000-0000-4000-8000-000000000004'),
  ('80000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005',4,'Quiet room and helpful lighting for content capture.',now(),'70000000-0000-4000-8000-000000000005');

create temp table non_one_roots_role_profiles on commit drop as
select id
from public.profiles
where role in ('producer', 'studio-owner', 'venue-owner')
  and id not in (select id from root_profiles);

update public.gigs
set permit_reviewed_by = null
where permit_reviewed_by in (select id from non_one_roots_role_profiles);

update public.studios
set permit_reviewed_by = null
where permit_reviewed_by in (select id from non_one_roots_role_profiles);

update public.withdrawal_requests
set processed_by = null
where processed_by in (select id from non_one_roots_role_profiles);

delete from public.permit_audit_log
where performed_by in (select id from non_one_roots_role_profiles);

delete from public.booking_requests
where sender_id in (select id from non_one_roots_role_profiles)
   or receiver_id in (select id from non_one_roots_role_profiles)
   or studio_id in (
     select id from public.studios
     where owner_id in (select id from non_one_roots_role_profiles)
   );

delete from public.gig_applications
where gig_id in (
     select id from public.gigs
     where organizer_id in (select id from non_one_roots_role_profiles)
   )
   or production_team_id in (
     select id from public.production_teams
     where owner_id in (select id from non_one_roots_role_profiles)
   );

delete from public.notifications
where user_id in (select id from non_one_roots_role_profiles);

delete from public.notifications
where meta ->> 'source' = 'seed_20260514'
  and meta ->> 'type' in ('gig_application', 'listing_connection_request');

delete from public.products
where seller_id in (select id from non_one_roots_role_profiles);

delete from public.shipping_profiles
where seller_id in (select id from non_one_roots_role_profiles);

delete from public.studios
where owner_id in (select id from non_one_roots_role_profiles);

delete from public.gigs
where organizer_id in (select id from non_one_roots_role_profiles);

delete from public.production_teams
where owner_id in (select id from non_one_roots_role_profiles);

delete from public.profiles
where id in (select id from non_one_roots_role_profiles);

delete from auth.identities
where user_id in (select id from non_one_roots_role_profiles);

delete from auth.users
where id in (select id from non_one_roots_role_profiles);

delete from public.studios
where owner_id = '4ac24041-ff7e-4482-b775-dc0cc5d3aac9'
  and name not in ('One Roots Studio A', 'One Roots Studio B');

delete from public.production_teams
where owner_id = 'bbfd86e2-3a7b-4a1b-94fe-9e6715d5a69b'
  and name <> 'Production ni Jared';

delete from public.gigs
where organizer_id = '77508736-9566-4538-96cb-4ae34be56a56'
  and name <> 'Gig Ni red';

commit;
