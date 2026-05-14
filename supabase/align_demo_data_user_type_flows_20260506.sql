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
      ('10000000-0000-4000-8000-000000000005'::uuid, 'producer')
  ) as expected(id, role)
  left join public.profiles p on p.id = expected.id and p.role = expected.role
  where p.id is null;

  if missing_count > 0 then
    raise exception 'Seed profile role preflight failed: % expected profile(s) missing or role-mismatched', missing_count;
  end if;
end $$;

delete from public.notifications
where meta @> '{"source":"seed_20260514"}'::jsonb
   or id in (
    '93000000-0000-4000-8000-000000000001'::uuid,
    '93000000-0000-4000-8000-000000000002'::uuid,
    '93000000-0000-4000-8000-000000000003'::uuid,
    '93000000-0000-4000-8000-000000000004'::uuid,
    '93000000-0000-4000-8000-000000000005'::uuid
   );

insert into public.notifications (id, user_id, type, title, message, read, image, meta) values
  ('93000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','info','New group application','Sampaguita Drive applied to Escolta Courtyard Vinyl Fair.',false,'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80','{"source":"seed_20260514","type":"gig_application","application_id":"92000000-0000-4000-8000-000000000001","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','info','New production application','Escolta Audio Bureau applied to Warehouse 42 Live Sessions.',false,'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80','{"source":"seed_20260514","type":"gig_application","application_id":"92000000-0000-4000-8000-000000000003","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','info','Production roster connected','Juan Dela Cruz is now on the Poblacion Stagecraft roster.',true,'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=80','{"source":"seed_20260514","type":"listing_connection_request","request_id":"92500000-0000-4000-8000-000000000001","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','info','Production roster invite','Escolta Audio Bureau invited Mara Reyes for listening room dates.',false,'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80','{"source":"seed_20260514","type":"listing_connection_request","request_id":"92500000-0000-4000-8000-000000000002","route":"/bookings"}'::jsonb),
  ('93000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','info','Venue invite accepted','Garden Set Collective is approved for Tagaytay Garden Reception.',true,'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80','{"source":"seed_20260514","type":"listing_connection_request","request_id":"92500000-0000-4000-8000-000000000004","route":"/bookings"}'::jsonb);

commit;
