-- Migration: Add permit_status and related columns to studios_with_stats and gigs_with_stats views.
--
-- Root cause: permit_status was added to the studios and gigs base tables in
-- 20260411143000_harden_reports_and_limit_permit_resubmission.sql, but the views
-- were never updated. Any .eq("permit_status", "approved") query against these
-- views fails silently (PostgREST returns an error, data is null), returning
-- no approved studios/gigs on the home feed and in the search modal.
--
-- Also adds `location` as an alias for `address` on studios_with_stats so that
-- the search OR-filter `location.ilike.%...%` works for studio queries.
--
-- New columns are appended at the end to satisfy CREATE OR REPLACE VIEW
-- column-order constraints.

BEGIN;

-- ─── studios_with_stats ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.studios_with_stats AS
 SELECT s.id,
    s.owner_id,
    s.name,
    s.address,
    s.hourly_rate,
    s.description,
    slp.amenities,
    slp.images,
    s.latitude,
    s.longitude,
    s.created_at,
    s.embedding,
    s.rate,
    s.contract_url,
    COALESCE(sap.availability, '[]'::jsonb) AS availability,
    slp.instruments,
        CASE
            WHEN COALESCE(array_length(slp.types, 1), 0) > 0 THEN slp.types[1]
            ELSE NULL::text
        END AS type,
    slp.types,
    s.rehearsal_rate,
    s.recording_rate,
    COALESCE(sap.open_dates, '[]'::jsonb) AS open_dates,
    s.pax,
    COALESCE(r.rating, 0::numeric) AS rating,
    COALESCE(r.review_count, 0::bigint) AS review_count,
    COALESCE(b.completion_rate, 100::numeric) AS completion_rate,
    COALESCE(ss.lead_time_hours, 24) AS lead_time_hours,
    COALESCE(ss.weekend_multiplier, 1.0) AS weekend_multiplier,
    COALESCE(ss.peak_season_multiplier, 1.0) AS peak_season_multiplier,
    COALESCE(ss.peak_season_dates, '[]'::jsonb) AS peak_season_dates,
    COALESCE(ss.off_peak_multiplier, 1.0) AS off_peak_multiplier,
    COALESCE(ss.off_peak_dates, '[]'::jsonb) AS off_peak_dates,
    COALESCE(ss.holiday_multiplier, 1.0) AS holiday_multiplier,
        CASE
            WHEN ss.peak_season_multiplier IS NOT NULL AND ss.peak_season_multiplier <> 1.0 THEN true
            WHEN ss.off_peak_multiplier IS NOT NULL AND ss.off_peak_multiplier <> 1.0 THEN true
            WHEN ss.weekend_multiplier IS NOT NULL AND ss.weekend_multiplier <> 1.0 THEN true
            ELSE false
        END AS has_seasonal_pricing,
    (EXISTS ( SELECT 1
           FROM studio_date_overrides sdo
          WHERE sdo.studio_id = s.id)) AS has_special_dates,
    -- Permit columns (added: 20260416)
    s.permit_status,
    s.permit_rejection_reason,
    s.permit_admin_notes,
    s.permit_reviewed_by,
    s.permit_reviewed_at,
    s.permit_resubmissions_used,
    -- Location alias for search compatibility (studios use `address` internally)
    s.address AS location
   FROM public.studios s
     LEFT JOIN ( SELECT rv.studio_id,
            avg(rv.rating) AS rating,
            count(rv.id) AS review_count
           FROM public.reviews rv
          GROUP BY rv.studio_id) r ON r.studio_id = s.id
     LEFT JOIN ( SELECT sb.studio_id,
                CASE
                    WHEN count(sb.id) = 0 THEN 100::numeric
                    ELSE round(count(
                    CASE
                        WHEN sb.status = 'completed'::text THEN 1
                        ELSE NULL::integer
                    END)::numeric / count(sb.id)::numeric * 100::numeric, 0)
                END AS completion_rate
           FROM public.studio_bookings sb
          WHERE sb.status = ANY (ARRAY['completed'::text, 'cancelled'::text])
          GROUP BY sb.studio_id) b ON b.studio_id = s.id
     LEFT JOIN public.studio_settings ss ON ss.studio_id = s.id
     LEFT JOIN public.studios_legacy_projection slp ON slp.id = s.id
     LEFT JOIN public.studios_availability_projection sap ON sap.studio_id = s.id;

-- ─── gigs_with_stats ─────────────────────────────────────────────────────────
-- Uses GROUP BY / aggregation, so new columns are added to GROUP BY as well.

CREATE OR REPLACE VIEW public.gigs_with_stats AS
 SELECT g.id,
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
    COALESCE(gap.availability, '[]'::jsonb) AS availability,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
    COALESCE(avg(r.rating), 0::numeric) AS rating,
    count(r.id) AS review_count,
    -- Permit columns (added: 20260416)
    g.permit_status,
    g.permit_rejection_reason,
    g.permit_admin_notes,
    g.permit_reviewed_by,
    g.permit_reviewed_at,
    g.permit_resubmissions_used
   FROM public.gigs g
     LEFT JOIN public.reviews r ON r.gig_id = g.id
     LEFT JOIN public.gigs_legacy_projection glp ON glp.id = g.id
     LEFT JOIN public.gigs_availability_projection gap ON gap.gig_id = g.id
  GROUP BY g.id, g.organizer_id, g.name, g.location, g.budget, g.description,
           g.event_date, glp.requirements, glp.images, glp.documents, g.status,
           g.latitude, g.longitude, g.created_at, g.embedding, g.rate,
           g.contract_url, g.business_permit_url, gap.availability,
           g.address_verification_status, g.address_verification_session_id,
           g.address_verified_at, g.verified_address,
           g.address_verification_completed_at,
           g.permit_status, g.permit_rejection_reason, g.permit_admin_notes,
           g.permit_reviewed_by, g.permit_reviewed_at, g.permit_resubmissions_used;

COMMIT;
