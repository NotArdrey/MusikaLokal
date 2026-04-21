-- Phase 1 Commercial Booking: RLS policies for all 9 new tables

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

CREATE POLICY "Deal participants can view teams"
    ON public.production_teams FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM venue_partnership_deals vpd
        WHERE vpd.production_team_id = vpd.id AND vpd.venue_owner_id = auth.uid()
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
-- venue_partnership_deals
-- ============================================================
CREATE POLICY "Deal participants can view deals"
    ON public.venue_partnership_deals FOR SELECT
    TO authenticated
    USING (
        venue_owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM production_team_members ptm
            WHERE ptm.team_id = venue_partnership_deals.production_team_id
            AND ptm.user_id = auth.uid()
        )
    );

CREATE POLICY "Deal proposers can create deals"
    ON public.venue_partnership_deals FOR INSERT
    TO authenticated
    WITH CHECK (proposed_by_user_id = auth.uid());

CREATE POLICY "Deal participants can update deals"
    ON public.venue_partnership_deals FOR UPDATE
    TO authenticated
    USING (
        venue_owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM production_team_members ptm
            WHERE ptm.team_id = venue_partnership_deals.production_team_id
            AND ptm.user_id = auth.uid()
            AND ptm.role = ANY (ARRAY['owner'::text, 'manager'::text])
        )
    );

-- ============================================================
-- deal_term_versions
-- ============================================================
CREATE POLICY "Deal participants can view term versions"
    ON public.deal_term_versions FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM venue_partnership_deals vpd
        WHERE vpd.id = deal_term_versions.deal_id
        AND (
            vpd.venue_owner_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM production_team_members ptm
                WHERE ptm.team_id = vpd.production_team_id AND ptm.user_id = auth.uid()
            )
        )
    ));

CREATE POLICY "Proposers can insert term versions"
    ON public.deal_term_versions FOR INSERT
    TO authenticated
    WITH CHECK (proposed_by_user_id = auth.uid());

-- ============================================================
-- deal_negotiation_events
-- ============================================================
CREATE POLICY "Deal participants can view negotiation events"
    ON public.deal_negotiation_events FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM venue_partnership_deals vpd
        WHERE vpd.id = deal_negotiation_events.deal_id
        AND (
            vpd.venue_owner_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM production_team_members ptm
                WHERE ptm.team_id = vpd.production_team_id AND ptm.user_id = auth.uid()
            )
        )
    ));

CREATE POLICY "Actors can insert negotiation events"
    ON public.deal_negotiation_events FOR INSERT
    TO authenticated
    WITH CHECK (actor_user_id = auth.uid());

-- ============================================================
-- studio_recording_deals
-- ============================================================
CREATE POLICY "Studio owners can manage recording deals"
    ON public.studio_recording_deals FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM studios s
        WHERE s.id = studio_recording_deals.studio_id AND s.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM studios s
        WHERE s.id = studio_recording_deals.studio_id AND s.owner_id = auth.uid()
    ));

CREATE POLICY "Counterparties can view and accept recording deals"
    ON public.studio_recording_deals FOR SELECT
    TO authenticated
    USING (counterparty_id = auth.uid());

CREATE POLICY "Counterparties can update recording deals"
    ON public.studio_recording_deals FOR UPDATE
    TO authenticated
    USING (counterparty_id = auth.uid())
    WITH CHECK (counterparty_id = auth.uid());

CREATE POLICY "Proposers can create recording deals"
    ON public.studio_recording_deals FOR INSERT
    TO authenticated
    WITH CHECK (proposed_by_user_id = auth.uid());

-- ============================================================
-- recording_deal_packages
-- ============================================================
CREATE POLICY "Deal participants can view packages"
    ON public.recording_deal_packages FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM studio_recording_deals srd
        WHERE srd.id = recording_deal_packages.deal_id
        AND (
            srd.counterparty_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM studios s
                WHERE s.id = srd.studio_id AND s.owner_id = auth.uid()
            )
        )
    ));

CREATE POLICY "Studio owners can manage packages"
    ON public.recording_deal_packages FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM studio_recording_deals srd
        JOIN studios s ON s.id = srd.studio_id
        WHERE srd.id = recording_deal_packages.deal_id AND s.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM studio_recording_deals srd
        JOIN studios s ON s.id = srd.studio_id
        WHERE srd.id = recording_deal_packages.deal_id AND s.owner_id = auth.uid()
    ));

-- ============================================================
-- booking_cancellation_policies
-- ============================================================
CREATE POLICY "Anyone can view active cancellation policies"
    ON public.booking_cancellation_policies FOR SELECT
    TO authenticated
    USING (is_active = true);

CREATE POLICY "Studio owners can manage cancellation policies"
    ON public.booking_cancellation_policies FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM studios s
        WHERE s.id = booking_cancellation_policies.studio_id AND s.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM studios s
        WHERE s.id = booking_cancellation_policies.studio_id AND s.owner_id = auth.uid()
    ));

-- ============================================================
-- booking_penalty_events
-- ============================================================
CREATE POLICY "Booking participants can view penalties"
    ON public.booking_penalty_events FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM studio_bookings sb
        WHERE sb.id = booking_penalty_events.booking_id
        AND (
            sb.user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM studios s
                WHERE s.id = sb.studio_id AND s.owner_id = auth.uid()
            )
        )
    ));

CREATE POLICY "Penalized users can view their penalties"
    ON public.booking_penalty_events FOR SELECT
    TO authenticated
    USING (penalized_user_id = auth.uid() OR beneficiary_user_id = auth.uid());
