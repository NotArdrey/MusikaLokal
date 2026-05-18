-- Drop confirmed unused columns after migration drift catch-up and deal-domain removal.

DO $$
DECLARE
  v_count bigint := 0;
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('profiles', 'resume_url', 'profiles.resume_url'),
        ('studio_bookings', 'musician_arrival_reported_at', 'studio_bookings.musician_arrival_reported_at'),
        ('studio_bookings', 'owner_entry_confirmed_at', 'studio_bookings.owner_entry_confirmed_at'),
        ('studio_settings', 'max_recording_songs_per_day', 'studio_settings.max_recording_songs_per_day'),
        ('studio_date_overrides', 'max_recording_songs_per_day', 'studio_date_overrides.max_recording_songs_per_day'),
        ('email_notifications', 'text_content', 'email_notifications.text_content'),
        ('email_notifications', 'sent_at', 'email_notifications.sent_at')
    ) AS nullable_checks(table_name, column_name, label)
  LOOP
    IF to_regclass(format('public.%I', r.table_name)) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = r.table_name
          AND c.column_name = r.column_name
      )
    THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IS NOT NULL', r.table_name, r.column_name)
      INTO v_count;

      IF v_count <> 0 THEN
        RAISE EXCEPTION '% still has % non-null rows; refusing cleanup drop', r.label, v_count;
      END IF;
    END IF;
  END LOOP;

  IF to_regclass('public.playlist_teaser_assets') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'playlist_teaser_assets'
        AND column_name = 'is_screened'
    )
  THEN
    SELECT count(*) INTO v_count
    FROM public.playlist_teaser_assets;

    IF v_count <> 0 THEN
      RAISE EXCEPTION 'playlist_teaser_assets has % rows; refusing to drop is_screened without another review', v_count;
    END IF;
  END IF;

  IF to_regclass('public.booking_incidents') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'booking_incidents'
        AND column_name IN ('reporter_evidence', 'counterparty_evidence', 'settlement_hold')
    )
  THEN
    SELECT count(*) INTO v_count
    FROM public.booking_incidents;

    IF v_count <> 0 THEN
      RAISE EXCEPTION 'booking_incidents has % rows; refusing to drop evidence/settlement columns without another review', v_count;
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.profiles
  DROP COLUMN IF EXISTS resume_url;

ALTER TABLE IF EXISTS public.studio_bookings
  DROP COLUMN IF EXISTS musician_arrival_reported_at,
  DROP COLUMN IF EXISTS owner_entry_confirmed_at;

ALTER TABLE IF EXISTS public.studio_settings
  DROP COLUMN IF EXISTS max_recording_songs_per_day;

ALTER TABLE IF EXISTS public.studio_date_overrides
  DROP COLUMN IF EXISTS max_recording_songs_per_day;

ALTER TABLE IF EXISTS public.email_notifications
  DROP COLUMN IF EXISTS text_content,
  DROP COLUMN IF EXISTS sent_at;

ALTER TABLE IF EXISTS public.playlist_teaser_assets
  DROP COLUMN IF EXISTS is_screened;

ALTER TABLE IF EXISTS public.booking_incidents
  DROP COLUMN IF EXISTS reporter_evidence,
  DROP COLUMN IF EXISTS counterparty_evidence,
  DROP COLUMN IF EXISTS settlement_hold;
