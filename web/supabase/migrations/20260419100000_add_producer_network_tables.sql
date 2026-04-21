-- Phase 2 Workstream 1: Producer Network Schema
-- Tables, indexes, views, and RLS for producer matching and discovery

-- 1. Producer Projects
CREATE TABLE public.producer_projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id uuid REFERENCES public.production_teams(id) ON DELETE SET NULL,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description text CHECK (char_length(description) <= 5000),
    genre text,
    location text,
    budget_range text,
    start_date date,
    end_date date,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'archived', 'cancelled')),
    max_roles integer DEFAULT 10 CHECK (max_roles > 0),
    is_remote boolean DEFAULT false,
    cover_image_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_producer_projects_owner ON public.producer_projects(owner_id);
CREATE INDEX idx_producer_projects_team ON public.producer_projects(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_producer_projects_status ON public.producer_projects(status);
CREATE INDEX idx_producer_projects_published ON public.producer_projects(created_at DESC) WHERE status = 'published';
CREATE INDEX idx_producer_projects_genre ON public.producer_projects(genre) WHERE genre IS NOT NULL;

-- 2. Producer Project Roles
CREATE TABLE public.producer_project_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.producer_projects(id) ON DELETE CASCADE,
    role_title text NOT NULL CHECK (char_length(role_title) BETWEEN 1 AND 100),
    role_type text NOT NULL DEFAULT 'instrument'
        CHECK (role_type IN ('instrument', 'vocal', 'production', 'support', 'other')),
    description text CHECK (char_length(description) <= 2000),
    is_required boolean DEFAULT true,
    max_slots integer DEFAULT 1 CHECK (max_slots > 0),
    filled_slots integer DEFAULT 0 CHECK (filled_slots >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_roles_project ON public.producer_project_roles(project_id);
CREATE INDEX idx_project_roles_unfilled ON public.producer_project_roles(project_id)
    WHERE filled_slots < max_slots;

-- 3. Producer Project Applications (musician → producer)
CREATE TABLE public.producer_project_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.producer_projects(id) ON DELETE CASCADE,
    role_id uuid REFERENCES public.producer_project_roles(id) ON DELETE SET NULL,
    applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cover_message text CHECK (char_length(cover_message) <= 2000),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired')),
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, applicant_id)
);

CREATE INDEX idx_project_apps_project ON public.producer_project_applications(project_id);
CREATE INDEX idx_project_apps_applicant ON public.producer_project_applications(applicant_id);
CREATE INDEX idx_project_apps_pending ON public.producer_project_applications(project_id, created_at DESC)
    WHERE status = 'pending';
CREATE INDEX idx_project_apps_status ON public.producer_project_applications(status);

-- 4. Producer Talent Invites (producer → musician)
CREATE TABLE public.producer_talent_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.producer_projects(id) ON DELETE CASCADE,
    role_id uuid REFERENCES public.producer_project_roles(id) ON DELETE SET NULL,
    inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message text CHECK (char_length(message) <= 2000),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'withdrawn')),
    expires_at timestamptz DEFAULT (now() + interval '14 days'),
    responded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, invitee_id)
);

CREATE INDEX idx_talent_invites_project ON public.producer_talent_invites(project_id);
CREATE INDEX idx_talent_invites_invitee ON public.producer_talent_invites(invitee_id);
CREATE INDEX idx_talent_invites_inviter ON public.producer_talent_invites(inviter_id);
CREATE INDEX idx_talent_invites_pending ON public.producer_talent_invites(invitee_id, created_at DESC)
    WHERE status = 'pending';

-- 5. Saved Talent (producer shortlists)
CREATE TABLE public.saved_talent (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    saver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    talent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    note text CHECK (char_length(note) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (saver_id, talent_id)
);

CREATE INDEX idx_saved_talent_saver ON public.saved_talent(saver_id);
CREATE INDEX idx_saved_talent_talent ON public.saved_talent(talent_id);

-- 6. Producer Match Activity Events (immutable audit log)
CREATE TABLE public.producer_match_activity_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL CHECK (event_type IN (
        'application_submitted', 'application_accepted', 'application_rejected',
        'application_withdrawn', 'application_expired',
        'invite_sent', 'invite_accepted', 'invite_rejected',
        'invite_withdrawn', 'invite_expired',
        'talent_saved', 'talent_unsaved',
        'project_published', 'project_archived', 'project_completed'
    )),
    project_id uuid REFERENCES public.producer_projects(id) ON DELETE SET NULL,
    actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    application_id uuid REFERENCES public.producer_project_applications(id) ON DELETE SET NULL,
    invite_id uuid REFERENCES public.producer_talent_invites(id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_events_project ON public.producer_match_activity_events(project_id)
    WHERE project_id IS NOT NULL;
CREATE INDEX idx_match_events_actor ON public.producer_match_activity_events(actor_id);
CREATE INDEX idx_match_events_target ON public.producer_match_activity_events(target_id)
    WHERE target_id IS NOT NULL;
CREATE INDEX idx_match_events_type ON public.producer_match_activity_events(event_type, created_at DESC);

-- Updated_at trigger function (reusable)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_producer_projects_updated_at
    BEFORE UPDATE ON public.producer_projects
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_project_applications_updated_at
    BEFORE UPDATE ON public.producer_project_applications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_talent_invites_updated_at
    BEFORE UPDATE ON public.producer_talent_invites
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Read models / views

CREATE OR REPLACE VIEW public.producer_projects_with_summary AS
SELECT
    pp.*,
    p.full_name AS owner_name,
    p.avatar_url AS owner_avatar,
    pt.name AS team_name,
    (SELECT count(*) FROM public.producer_project_roles pr WHERE pr.project_id = pp.id) AS total_roles,
    (SELECT coalesce(sum(pr.filled_slots), 0) FROM public.producer_project_roles pr WHERE pr.project_id = pp.id) AS filled_roles,
    (SELECT count(*) FROM public.producer_project_applications pa WHERE pa.project_id = pp.id AND pa.status = 'pending') AS pending_applications,
    (SELECT count(*) FROM public.producer_talent_invites ti WHERE ti.project_id = pp.id AND ti.status = 'pending') AS pending_invites
FROM public.producer_projects pp
JOIN public.profiles p ON p.id = pp.owner_id
LEFT JOIN public.production_teams pt ON pt.id = pp.team_id;

CREATE OR REPLACE VIEW public.producer_matches_with_summary AS
SELECT
    'application' AS match_type,
    pa.id AS match_id,
    pa.project_id,
    pp.title AS project_title,
    pa.applicant_id AS musician_id,
    pm.full_name AS musician_name,
    pm.avatar_url AS musician_avatar,
    pa.status,
    pa.cover_message AS message,
    pa.created_at,
    pa.updated_at,
    pr.role_title,
    pp.owner_id AS producer_id
FROM public.producer_project_applications pa
JOIN public.producer_projects pp ON pp.id = pa.project_id
JOIN public.profiles pm ON pm.id = pa.applicant_id
LEFT JOIN public.producer_project_roles pr ON pr.id = pa.role_id
UNION ALL
SELECT
    'invite' AS match_type,
    ti.id AS match_id,
    ti.project_id,
    pp.title AS project_title,
    ti.invitee_id AS musician_id,
    pm.full_name AS musician_name,
    pm.avatar_url AS musician_avatar,
    ti.status,
    ti.message,
    ti.created_at,
    ti.updated_at,
    pr.role_title,
    pp.owner_id AS producer_id
FROM public.producer_talent_invites ti
JOIN public.producer_projects pp ON pp.id = ti.project_id
JOIN public.profiles pm ON pm.id = ti.invitee_id
LEFT JOIN public.producer_project_roles pr ON pr.id = ti.role_id;

-- RLS Policies

ALTER TABLE public.producer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producer_project_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producer_project_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producer_talent_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producer_match_activity_events ENABLE ROW LEVEL SECURITY;

-- Producer Projects: public read for published, owner/team full access
CREATE POLICY producer_projects_select ON public.producer_projects
    FOR SELECT USING (
        status = 'published'
        OR owner_id = auth.uid()
        OR (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.production_team_members ptm
            WHERE ptm.team_id = producer_projects.team_id AND ptm.user_id = auth.uid()
        ))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY producer_projects_insert ON public.producer_projects
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY producer_projects_update ON public.producer_projects
    FOR UPDATE USING (
        owner_id = auth.uid()
        OR (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.production_team_members ptm
            WHERE ptm.team_id = producer_projects.team_id
            AND ptm.user_id = auth.uid()
            AND ptm.role IN ('owner', 'manager')
        ))
    );

CREATE POLICY producer_projects_delete ON public.producer_projects
    FOR DELETE USING (owner_id = auth.uid());

-- Project Roles: visible if project is visible
CREATE POLICY project_roles_select ON public.producer_project_roles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_project_roles.project_id
            AND (pp.status = 'published' OR pp.owner_id = auth.uid()
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

CREATE POLICY project_roles_insert ON public.producer_project_roles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_project_roles.project_id AND pp.owner_id = auth.uid()
        )
    );

CREATE POLICY project_roles_update ON public.producer_project_roles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_project_roles.project_id AND pp.owner_id = auth.uid()
        )
    );

CREATE POLICY project_roles_delete ON public.producer_project_roles
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_project_roles.project_id AND pp.owner_id = auth.uid()
        )
    );

-- Applications: applicant sees own, project owner sees all for project, admin sees all
CREATE POLICY project_apps_select ON public.producer_project_applications
    FOR SELECT USING (
        applicant_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_project_applications.project_id AND pp.owner_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY project_apps_insert ON public.producer_project_applications
    FOR INSERT WITH CHECK (applicant_id = auth.uid());

CREATE POLICY project_apps_update ON public.producer_project_applications
    FOR UPDATE USING (
        applicant_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_project_applications.project_id AND pp.owner_id = auth.uid()
        )
    );

-- Talent Invites: invitee sees own, inviter sees own, project owner sees all, admin
CREATE POLICY talent_invites_select ON public.producer_talent_invites
    FOR SELECT USING (
        invitee_id = auth.uid()
        OR inviter_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_talent_invites.project_id AND pp.owner_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY talent_invites_insert ON public.producer_talent_invites
    FOR INSERT WITH CHECK (inviter_id = auth.uid());

CREATE POLICY talent_invites_update ON public.producer_talent_invites
    FOR UPDATE USING (
        invitee_id = auth.uid()
        OR inviter_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_talent_invites.project_id AND pp.owner_id = auth.uid()
        )
    );

-- Saved Talent: only saver can see/manage
CREATE POLICY saved_talent_select ON public.saved_talent
    FOR SELECT USING (saver_id = auth.uid());

CREATE POLICY saved_talent_insert ON public.saved_talent
    FOR INSERT WITH CHECK (saver_id = auth.uid());

CREATE POLICY saved_talent_delete ON public.saved_talent
    FOR DELETE USING (saver_id = auth.uid());

-- Activity Events: visible to actor, target, project owner, admin
CREATE POLICY match_events_select ON public.producer_match_activity_events
    FOR SELECT USING (
        actor_id = auth.uid()
        OR target_id = auth.uid()
        OR (project_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.producer_projects pp
            WHERE pp.id = producer_match_activity_events.project_id AND pp.owner_id = auth.uid()
        ))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY match_events_insert ON public.producer_match_activity_events
    FOR INSERT WITH CHECK (actor_id = auth.uid());
