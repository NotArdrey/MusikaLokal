-- Allow admin-owned station rows to stay attached to the profile they represent.

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS managed_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.stations.managed_profile_id IS
'Profile whose radio station this row represents. Admins may manage the row while creator_id points at the admin account.';

UPDATE public.stations
SET managed_profile_id = creator_id
WHERE managed_profile_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stations_managed_profile ON public.stations(managed_profile_id);

DROP POLICY IF EXISTS stations_select ON public.stations;
CREATE POLICY stations_select ON public.stations
    FOR SELECT USING (
        is_active = true
        OR creator_id = auth.uid()
        OR managed_profile_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS station_slots_select ON public.station_playlist_slots;
CREATE POLICY station_slots_select ON public.station_playlist_slots
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.stations s
            WHERE s.id = station_playlist_slots.station_id
              AND (
                s.is_active = true
                OR s.creator_id = auth.uid()
                OR s.managed_profile_id = auth.uid()
              )
        )
    );