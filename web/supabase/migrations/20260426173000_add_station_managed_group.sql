-- Allow radio stations to represent duos and groups directly.

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS managed_group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.stations.managed_group_id IS
'Group or duo whose radio station this row represents. Null means the station represents managed_profile_id directly.';

CREATE INDEX IF NOT EXISTS idx_stations_managed_group
  ON public.stations(managed_group_id)
  WHERE managed_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stations_profile_station
  ON public.stations(managed_profile_id)
  WHERE managed_profile_id IS NOT NULL AND managed_group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stations_group_station
  ON public.stations(managed_group_id)
  WHERE managed_group_id IS NOT NULL;

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
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
              )
        )
    );
