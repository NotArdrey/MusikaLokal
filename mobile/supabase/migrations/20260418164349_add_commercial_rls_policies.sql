-- Phase 1 Commercial Booking: RLS policies for production and booking policy tables

-- ============================================================
-- production_teams
-- ============================================================
CREATE POLICY "Team owners can manage their teams"
    ON public.production_teams FOR ALL
    TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Team members can view their teams"
    ON public.production_teams FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM production_team_members ptm
        WHERE ptm.team_id = ptm.id AND ptm.user_id = auth.uid()
    ));


-- ============================================================
-- production_team_members
-- ============================================================
CREATE POLICY "Members can view their own team memberships"
    ON public.production_team_members FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Team owners and managers can manage members"
    ON public.production_team_members FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM production_team_members ptm2
        WHERE ptm2.team_id = ptm2.team_id
        AND ptm2.user_id = auth.uid()
        AND ptm2.role = ANY (ARRAY['owner'::text, 'manager'::text])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM production_team_members ptm2
        WHERE ptm2.team_id = ptm2.team_id
        AND ptm2.user_id = auth.uid()
        AND ptm2.role = ANY (ARRAY['owner'::text, 'manager'::text])
    ));

CREATE POLICY "Team owner insert bootstrap"
    ON public.production_team_members FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM production_teams pt
        WHERE pt.id = production_team_members.team_id AND pt.owner_id = auth.uid()
    ));

-- ============================================================


