ALTER TABLE public.stations
    ADD COLUMN IF NOT EXISTS rotation_interval_minutes integer;

UPDATE public.stations
SET rotation_interval_minutes = 15
WHERE rotation_interval_minutes IS NULL;

ALTER TABLE public.stations
    ALTER COLUMN rotation_interval_minutes SET DEFAULT 15;

ALTER TABLE public.stations
    ALTER COLUMN rotation_interval_minutes SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stations_rotation_interval_minutes_check'
    ) THEN
        ALTER TABLE public.stations
            ADD CONSTRAINT stations_rotation_interval_minutes_check
            CHECK (rotation_interval_minutes BETWEEN 5 AND 120);
    END IF;
END $$;