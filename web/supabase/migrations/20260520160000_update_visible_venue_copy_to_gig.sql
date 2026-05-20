-- Rename user-visible saved copy from venue to gig without changing internal
-- role, route, entity-type, or identifier contracts.

CREATE OR REPLACE FUNCTION pg_temp.musikalokal_visible_gig_copy(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  next_value text := value;
BEGIN
  IF next_value IS NULL THEN
    RETURN NULL;
  END IF;

  next_value := regexp_replace(next_value, '(^|[^[:alnum:]_-])Venues([^[:alnum:]_-]|$)', '\1Gigs\2', 'g');
  next_value := regexp_replace(next_value, '(^|[^[:alnum:]_-])venues([^[:alnum:]_-]|$)', '\1gigs\2', 'g');
  next_value := regexp_replace(next_value, '(^|[^[:alnum:]_-])Venue([^[:alnum:]_-]|$)', '\1Gig\2', 'g');
  next_value := regexp_replace(next_value, '(^|[^[:alnum:]_-])venue([^[:alnum:]_-]|$)', '\1gig\2', 'g');

  RETURN next_value;
END;
$function$;

CREATE OR REPLACE FUNCTION pg_temp.musikalokal_visible_gig_jsonb(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  raw_value text;
  next_value jsonb;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(value)
    WHEN 'string' THEN
      raw_value := value #>> '{}';

      IF raw_value IN ('venue', 'Venue', 'venues', 'Venues', 'venue-owner', 'venue_owner', '/my_venue', 'my_venue') THEN
        RETURN value;
      END IF;

      RETURN to_jsonb(pg_temp.musikalokal_visible_gig_copy(raw_value));

    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(pg_temp.musikalokal_visible_gig_jsonb(element.value)), '[]'::jsonb)
      INTO next_value
      FROM jsonb_array_elements(value) AS element(value);

      RETURN next_value;

    WHEN 'object' THEN
      SELECT COALESCE(
        jsonb_object_agg(
          entry.key,
          CASE
            WHEN entry.key IN (
              'entity_type',
              'listing_type',
              'receiver_entity_type',
              'request_kind',
              'resource_type',
              'role',
              'route',
              'route_path',
              'sender_entity_type',
              'source',
              'target_type',
              'type'
            )
              THEN entry.value
            WHEN entry.key LIKE '%_id'
              THEN entry.value
            ELSE pg_temp.musikalokal_visible_gig_jsonb(entry.value)
          END
        ),
        '{}'::jsonb
      )
      INTO next_value
      FROM jsonb_each(value) AS entry(key, value);

      RETURN next_value;

    ELSE
      RETURN value;
  END CASE;
END;
$function$;

UPDATE public.notifications
SET
  title = pg_temp.musikalokal_visible_gig_copy(title),
  message = pg_temp.musikalokal_visible_gig_copy(message),
  meta = pg_temp.musikalokal_visible_gig_jsonb(meta)
WHERE
  title ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)'
  OR message ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)'
  OR meta::text ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.booking_requests
SET
  message = pg_temp.musikalokal_visible_gig_copy(message),
  event_details = pg_temp.musikalokal_visible_gig_jsonb(event_details)
WHERE
  message ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)'
  OR event_details::text ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.gigs
SET description = pg_temp.musikalokal_visible_gig_copy(description)
WHERE description ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.profiles
SET bio = pg_temp.musikalokal_visible_gig_copy(bio)
WHERE bio ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.production_teams
SET description = pg_temp.musikalokal_visible_gig_copy(description)
WHERE description ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.reviews
SET content = pg_temp.musikalokal_visible_gig_copy(content)
WHERE content ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.feed_posts
SET content = pg_temp.musikalokal_visible_gig_copy(content)
WHERE content ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.gig_applications
SET
  pitch_message = pg_temp.musikalokal_visible_gig_copy(pitch_message),
  note = pg_temp.musikalokal_visible_gig_copy(note),
  cancellation_reason = pg_temp.musikalokal_visible_gig_copy(cancellation_reason),
  system_status_reason = pg_temp.musikalokal_visible_gig_copy(system_status_reason),
  performer_snapshot = pg_temp.musikalokal_visible_gig_jsonb(performer_snapshot)
WHERE
  pitch_message ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)'
  OR note ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)'
  OR cancellation_reason ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)'
  OR system_status_reason ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)'
  OR performer_snapshot::text ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';

UPDATE public.social_activity_events
SET metadata = pg_temp.musikalokal_visible_gig_jsonb(metadata)
WHERE metadata::text ~* '(^|[^[:alnum:]_-])venues?([^[:alnum:]_-]|$)';
