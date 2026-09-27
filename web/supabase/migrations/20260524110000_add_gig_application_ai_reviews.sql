-- Store AI recommendations separately from the application decision.
-- The gig user still makes the final accept/reject decision.
CREATE TABLE IF NOT EXISTS public.gig_application_ai_reviews (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    application_id uuid NOT NULL REFERENCES public.gig_applications(id) ON DELETE CASCADE,
    gig_id uuid NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
    applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    recommendation text,
    confidence numeric,
    summary text,
    text_pdf_summary text,
    video_summary text,
    reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    concerns jsonb NOT NULL DEFAULT '[]'::jsonb,
    missing_info jsonb NOT NULL DEFAULT '[]'::jsonb,
    text_pdf_review jsonb NOT NULL DEFAULT '{}'::jsonb,
    video_review jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    model_text text,
    model_video text,
    requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT gig_application_ai_reviews_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    CONSTRAINT gig_application_ai_reviews_recommendation_check
        CHECK (
            recommendation IS NULL OR
            recommendation IN (
                'strong_match',
                'good_match',
                'needs_review',
                'not_recommended',
                'insufficient_info'
            )
        ),
    CONSTRAINT gig_application_ai_reviews_confidence_check
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS gig_application_ai_reviews_application_id_key
    ON public.gig_application_ai_reviews(application_id);

CREATE INDEX IF NOT EXISTS idx_gig_application_ai_reviews_gig_status
    ON public.gig_application_ai_reviews(gig_id, status);

CREATE INDEX IF NOT EXISTS idx_gig_application_ai_reviews_applicant
    ON public.gig_application_ai_reviews(applicant_id);

ALTER TABLE public.gig_application_ai_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gig users can read AI reviews for their gigs"
    ON public.gig_application_ai_reviews;
CREATE POLICY "Gig users can read AI reviews for their gigs"
    ON public.gig_application_ai_reviews
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.gigs g
            WHERE g.id = gig_application_ai_reviews.gig_id
              AND g.organizer_id = auth.uid()
        )
        OR public.staff_can_read_gig(auth.uid(), gig_application_ai_reviews.gig_id)
    );

DROP POLICY IF EXISTS "Service role can manage AI reviews"
    ON public.gig_application_ai_reviews;
CREATE POLICY "Service role can manage AI reviews"
    ON public.gig_application_ai_reviews
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP TRIGGER IF EXISTS set_gig_application_ai_reviews_updated_at
    ON public.gig_application_ai_reviews;
CREATE TRIGGER set_gig_application_ai_reviews_updated_at
    BEFORE UPDATE ON public.gig_application_ai_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.queue_gig_application_ai_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.gig_application_ai_reviews (
        application_id,
        gig_id,
        applicant_id,
        status
    )
    VALUES (
        NEW.id,
        NEW.gig_id,
        NEW.applicant_id,
        'pending'
    )
    ON CONFLICT (application_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_gig_application_ai_review
    ON public.gig_applications;
CREATE TRIGGER queue_gig_application_ai_review
    AFTER INSERT ON public.gig_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.queue_gig_application_ai_review();

GRANT SELECT ON public.gig_application_ai_reviews TO authenticated;
;
