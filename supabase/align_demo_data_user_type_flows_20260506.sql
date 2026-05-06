begin;

do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from (
    values
      ('10000000-0000-4000-8000-000000000001'::uuid, 'musician'),
      ('10000000-0000-4000-8000-000000000002'::uuid, 'musician'),
      ('10000000-0000-4000-8000-000000000003'::uuid, 'studio-owner'),
      ('10000000-0000-4000-8000-000000000004'::uuid, 'venue-owner'),
      ('10000000-0000-4000-8000-000000000005'::uuid, 'producer'),
      ('10000000-0000-4000-8000-000000000006'::uuid, 'fan')
  ) as expected(id, role)
  left join public.profiles p on p.id = expected.id and p.role = expected.role
  where p.id is null;

  if missing_count > 0 then
    raise exception 'Demo profile role preflight failed: % expected profile(s) missing or role-mismatched', missing_count;
  end if;
end $$;

delete from public.notifications
where meta @> '{"source":"demo_user_type_alignment_20260506"}'::jsonb
   or id in (
    '93000000-0000-4000-8000-000000000001'::uuid,
    '93000000-0000-4000-8000-000000000002'::uuid,
    '93000000-0000-4000-8000-000000000003'::uuid,
    '93000000-0000-4000-8000-000000000004'::uuid
   );

delete from public.booking_requests
where event_details @> '{"source":"demo_user_type_alignment_20260506"}'::jsonb
   or id in (
    '92500000-0000-4000-8000-000000000001'::uuid,
    '92500000-0000-4000-8000-000000000002'::uuid
   );

delete from public.gig_applications
where id in (
  '92000000-0000-4000-8000-000000000001'::uuid,
  '92000000-0000-4000-8000-000000000002'::uuid,
  '92000000-0000-4000-8000-000000000003'::uuid,
  '92000000-0000-4000-8000-000000000004'::uuid
);

delete from public.order_fulfillments
where order_id = '94000000-0000-4000-8000-000000000001'::uuid;

delete from public.order_items
where order_id = '94000000-0000-4000-8000-000000000001'::uuid;

delete from public.orders
where id = '94000000-0000-4000-8000-000000000001'::uuid;

delete from public.favorites
where id in (
  '95000000-0000-4000-8000-000000000001'::uuid,
  '95000000-0000-4000-8000-000000000002'::uuid,
  '95000000-0000-4000-8000-000000000003'::uuid,
  '95000000-0000-4000-8000-000000000004'::uuid
);

delete from public.production_team_roster
where team_id = '90000000-0000-4000-8000-000000000001'::uuid;

delete from public.production_team_members
where team_id = '90000000-0000-4000-8000-000000000001'::uuid;

delete from public.production_teams
where id = '90000000-0000-4000-8000-000000000001'::uuid;

insert into public.production_teams (
  id,
  owner_id,
  name,
  description,
  logo_url
) values (
  '90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000005',
  'Kapitolyo Live Works',
  'Producer-led team coordinating live session lineups, release support, and event-ready rosters for Metro Manila artists.',
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80'
);

insert into public.production_team_members (
  team_id,
  user_id,
  role
) values
  ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','owner'),
  ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','member'),
  ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member');

insert into public.production_team_roster (
  id,
  team_id,
  entity_kind,
  profile_id,
  group_id,
  added_by_user_id
) values
  ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','musician','10000000-0000-4000-8000-000000000001',null,'10000000-0000-4000-8000-000000000005'),
  ('91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','musician','10000000-0000-4000-8000-000000000002',null,'10000000-0000-4000-8000-000000000005'),
  ('91000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001','group',null,'30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005'),
  ('91000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001','duo',null,'30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005');

insert into public.gig_applications (
  id,
  applicant_id,
  group_id,
  gig_id,
  pitch_message,
  video_url,
  status,
  cv_url,
  is_solo_application,
  slot_type,
  submitted_by_user_id,
  leader_approval_status,
  leader_reviewed_at,
  production_team_id,
  production_roster_id,
  note
) values
  (
    '92000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Baybayin Brass can bring a tight soul and funk set with a horn section for the Warehouse 42 showcase.',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'accepted',
    'https://example.com/demo/mara-reyes-epk.pdf',
    false,
    'band',
    '10000000-0000-4000-8000-000000000001',
    'approved',
    timezone('utc'::text, now()),
    null,
    null,
    'Direct musician/group application path seeded for venue-owner review.'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    null,
    '40000000-0000-4000-8000-000000000002',
    'Kai can play a stripped-down acoustic set with looped guitar textures for the rooftop sunset program.',
    'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
    'pending',
    'https://example.com/demo/kai-delacruz-epk.pdf',
    true,
    'solo',
    '10000000-0000-4000-8000-000000000002',
    null,
    null,
    null,
    null,
    'Solo musician application path seeded for the musician gig flow.'
  ),
  (
    '92000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    'Kapitolyo Live Works can coordinate Neon Sampaguita as a produced duo slot with backline-ready stage plots.',
    'https://www.youtube.com/watch?v=oHg5SJYRHA0',
    'pending',
    'https://example.com/demo/kapitolyo-live-works-roster.pdf',
    false,
    'duo',
    '10000000-0000-4000-8000-000000000005',
    null,
    null,
    '90000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000004',
    'Producer application path seeded with production_team_id and production_roster_id.'
  ),
  (
    '92000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
    null,
    '40000000-0000-4000-8000-000000000002',
    'Kapitolyo Live Works can book Mara as a solo soul vocalist and handle call time, tech rider, and settlement.',
    'https://www.youtube.com/watch?v=9bZkp7q19f0',
    'approved',
    'https://example.com/demo/kapitolyo-live-works-mara.pdf',
    false,
    'solo',
    '10000000-0000-4000-8000-000000000005',
    null,
    null,
    '90000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'Approved producer application path seeded for organizer and producer dashboards.'
  );

insert into public.booking_requests (
  id,
  sender_id,
  receiver_id,
  group_id,
  studio_id,
  message,
  status,
  attachment_url,
  event_details
) values
  (
    '92500000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    null,
    null,
    'Kapitolyo Live Works invited Mara Reyes to join the production team roster.',
    'accepted',
    'https://example.com/demo/kapitolyo-live-works-invite.pdf',
    jsonb_build_object(
      'type', 'listing_connection_request',
      'sender_entity_type', 'production_team',
      'sender_entity_id', '90000000-0000-4000-8000-000000000001',
      'sender_entity_name', 'Kapitolyo Live Works',
      'receiver_entity_type', 'musician',
      'receiver_entity_id', '10000000-0000-4000-8000-000000000001',
      'receiver_entity_name', 'Mara Reyes',
      'production_team_id', '90000000-0000-4000-8000-000000000001',
      'request_kind', 'invite',
      'route', '/bookings',
      'route_params', jsonb_build_object('tab', 'Pending'),
      'source', 'demo_user_type_alignment_20260506',
      'request_details', jsonb_build_object(
        'pitch_message', 'Accepted roster invite for the seeded producer workflow.',
        'context_label', 'Production roster invite',
        'roster_entry_name', 'Mara Reyes',
        'roster_entry_kind', 'musician'
      )
    )
  ),
  (
    '92500000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000002',
    null,
    null,
    'Kapitolyo Live Works invited Kai Dela Cruz to support duo and session-guitar roster bookings.',
    'accepted',
    'https://example.com/demo/kapitolyo-live-works-kai-invite.pdf',
    jsonb_build_object(
      'type', 'listing_connection_request',
      'sender_entity_type', 'production_team',
      'sender_entity_id', '90000000-0000-4000-8000-000000000001',
      'sender_entity_name', 'Kapitolyo Live Works',
      'receiver_entity_type', 'musician',
      'receiver_entity_id', '10000000-0000-4000-8000-000000000002',
      'receiver_entity_name', 'Kai Dela Cruz',
      'production_team_id', '90000000-0000-4000-8000-000000000001',
      'request_kind', 'invite',
      'route', '/bookings',
      'route_params', jsonb_build_object('tab', 'Pending'),
      'source', 'demo_user_type_alignment_20260506',
      'request_details', jsonb_build_object(
        'pitch_message', 'Accepted roster invite for the seeded producer workflow.',
        'context_label', 'Production roster invite',
        'roster_entry_name', 'Kai Dela Cruz',
        'roster_entry_kind', 'musician'
      )
    )
  );

insert into public.notifications (
  id,
  user_id,
  type,
  title,
  message,
  read,
  image,
  meta
) values
  (
    '93000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    'info',
    'New group application',
    'Baybayin Brass applied to Warehouse 42 Live Sessions.',
    false,
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80',
    jsonb_build_object('source','demo_user_type_alignment_20260506','type','gig_application','application_id','92000000-0000-4000-8000-000000000001','route','/bookings')
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000004',
    'info',
    'New producer application',
    'Kapitolyo Live Works applied to Harbor Rooftop Acoustic Night.',
    false,
    'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=80',
    jsonb_build_object('source','demo_user_type_alignment_20260506','type','gig_application','application_id','92000000-0000-4000-8000-000000000004','route','/bookings')
  ),
  (
    '93000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'info',
    'Production roster connected',
    'Mara Reyes is now on the Kapitolyo Live Works roster.',
    true,
    'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=80',
    jsonb_build_object('source','demo_user_type_alignment_20260506','type','listing_connection_request','request_id','92500000-0000-4000-8000-000000000001','route','/bookings')
  ),
  (
    '93000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'info',
    'Production roster connected',
    'Kai Dela Cruz is now on the Kapitolyo Live Works roster.',
    true,
    'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=80',
    jsonb_build_object('source','demo_user_type_alignment_20260506','type','listing_connection_request','request_id','92500000-0000-4000-8000-000000000002','route','/bookings')
  );

insert into public.favorites (
  id,
  user_id,
  group_id,
  studio_id,
  gig_id,
  profile_id
) values
  ('95000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006',null,'20000000-0000-4000-8000-000000000001',null,null),
  ('95000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006',null,null,'40000000-0000-4000-8000-000000000002',null),
  ('95000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000002',null,null,null),
  ('95000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000006',null,null,null,'10000000-0000-4000-8000-000000000001');

insert into public.orders (
  id,
  buyer_id,
  seller_id,
  order_number,
  status,
  subtotal,
  shipping_fee,
  total_amount,
  currency,
  shipping_profile_id,
  shipping_address,
  payment_reference,
  notes,
  confirmed_at
) values (
  '94000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000005',
  'ORD-DEMO-FAN-001',
  'confirmed',
  850,
  120,
  970,
  'PHP',
  '50000000-0000-4000-8000-000000000001',
  '{"name":"Nina Tan","phone":"+63 917 555 0106","line1":"Greenhills, San Juan City","city":"San Juan","region":"NCR","country":"PH"}'::jsonb,
  'DEMO-WALLET-PAID-001',
  'Fan purchase seeded to exercise marketplace buyer/seller flows.',
  timezone('utc'::text, now())
);

insert into public.order_items (
  order_id,
  product_id,
  variant_id,
  product_title,
  variant_label,
  quantity,
  unit_price,
  line_total
) values (
  '94000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  null,
  'Baybayin Brass Tour Shirt',
  'Medium',
  1,
  850,
  850
);

insert into public.order_fulfillments (
  order_id,
  fulfillment_type,
  status,
  tracking_number,
  carrier,
  shipped_at,
  notes
) values (
  '94000000-0000-4000-8000-000000000001',
  'shipment',
  'preparing',
  'DEMO-PH-TRACK-001',
  'MusikaLokal Courier',
  null,
  'Seller is preparing the merch order for NCR courier pickup.'
);

commit;
