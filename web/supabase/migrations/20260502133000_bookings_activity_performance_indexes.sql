-- Bookings/activity supporting indexes for mobile screen payloads.
-- These target the follow-up reads used by manage-bookings and the activity tab.

CREATE INDEX IF NOT EXISTS idx_booking_attendance_events_booking_late_created
ON public.booking_attendance_events (booking_id, created_at DESC)
WHERE event_type = 'late';

CREATE INDEX IF NOT EXISTS idx_groups_owner_id
ON public.groups (owner_id);

CREATE INDEX IF NOT EXISTS idx_gigs_organizer_created_desc
ON public.gigs (organizer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gig_applications_applicant_created_desc
ON public.gig_applications (applicant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gig_applications_submitted_leader_created_desc
ON public.gig_applications (submitted_by_user_id, leader_approval_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gig_applications_gig_status_created_desc
ON public.gig_applications (gig_id, status, created_at DESC);
