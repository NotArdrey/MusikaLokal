drop trigger if exists trg_gigs_sync_availability_3nf_from_legacy on public.gigs;
drop trigger if exists trg_groups_sync_availability_3nf_from_legacy on public.groups;
drop trigger if exists trg_studios_sync_availability_3nf_from_legacy on public.studios;

drop function if exists public.trg_sync_gig_availability_3nf_from_legacy();
drop function if exists public.trg_sync_group_availability_3nf_from_legacy();
drop function if exists public.trg_sync_studio_availability_3nf_from_legacy();

drop function if exists public.sync_gig_availability_3nf(uuid);
drop function if exists public.sync_group_availability_3nf(uuid);
drop function if exists public.sync_studio_availability_3nf(uuid);

create or replace view public.gigs_with_stats as
 select g.id,
    g.organizer_id,
    g.name,
    g.location,
    g.budget,
    g.description,
    g.event_date,
    glp.requirements,
    glp.images,
    glp.documents,
    g.status,
    g.latitude,
    g.longitude,
    g.created_at,
    g.embedding,
    g.rate,
    g.contract_url,
    g.business_permit_url,
    coalesce(gap.availability, '[]'::jsonb) as availability,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
    coalesce(avg(r.rating), 0::numeric) as rating,
    count(r.id) as review_count
   from public.gigs g
     left join public.reviews r on r.gig_id = g.id
     left join public.gigs_legacy_projection glp on glp.id = g.id
     left join public.gigs_availability_projection gap on gap.gig_id = g.id
  group by g.id, g.organizer_id, g.name, g.location, g.budget, g.description, g.event_date, glp.requirements, glp.images, glp.documents, g.status, g.latitude, g.longitude, g.created_at, g.embedding, g.rate, g.contract_url, g.business_permit_url, gap.availability, g.address_verification_status, g.address_verification_session_id, g.address_verified_at, g.verified_address, g.address_verification_completed_at;

create or replace view public.gigs_with_verification as
 select g.id,
    g.organizer_id,
    g.name,
    g.location,
    g.budget,
    g.description,
    g.event_date,
    glp.requirements,
    glp.images,
    glp.documents,
    g.status,
    g.latitude,
    g.longitude,
    g.created_at,
    g.embedding,
    g.rate,
    g.contract_url,
    coalesce(gap.availability, '[]'::jsonb) as availability,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
        case
            when g.address_verification_status = any (array['APPROVED'::text, 'VERIFIED'::text]) then true
            else false
        end as is_address_verified,
    avs.extracted_address as session_extracted_address,
    avs.extracted_name as session_extracted_name,
    avs.issuer as verification_issuer,
    avs.notes as verification_notes,
    avs.provider as verification_provider,
    avs.archive_id as smile_archive_id
   from public.gigs g
     left join public.gigs_legacy_projection glp on glp.id = g.id
     left join public.gigs_availability_projection gap on gap.gig_id = g.id
     left join public.address_verification_sessions avs on avs.entity_type = 'gig'::text and avs.entity_id = g.id and (avs.status = any (array['APPROVED'::text, 'VERIFIED'::text]));

  create or replace view public.groups_with_stats as
   select g.id,
     g.owner_id,
     g.name,
     g.genre,
     g.description,
     glp.members,
     g.location,
     glp.images,
     g.latitude,
     g.longitude,
     g.rate,
     g.created_at,
     g.group_type,
     coalesce(gap.availability, '[]'::jsonb) as availability,
     coalesce(avg(r.rating), 0::numeric) as rating,
     count(r.id) as review_count
    from public.groups g
      left join public.reviews r on r.group_id = g.id
      left join public.groups_legacy_projection glp on glp.id = g.id
      left join public.groups_availability_projection gap on gap.group_id = g.id
    group by g.id, g.owner_id, g.name, g.genre, g.description, glp.members, g.location, glp.images, g.latitude, g.longitude, g.rate, g.created_at, g.group_type, gap.availability;

alter table public.gigs
  drop column if exists availability;

alter table public.groups
  drop column if exists availability;

alter table public.studios
  drop column if exists open_dates;