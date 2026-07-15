-- Keep public profile timeline visibility aligned with the explicit per-gig
-- featuring decision. Both accepted status spellings are used by current flows.

drop policy if exists "Accepted profile timeline applications are publicly visible"
  on public.gig_applications;

create policy "Accepted profile timeline applications are publicly visible"
  on public.gig_applications
  as permissive
  for select
  to public
  using (
    status in ('accepted', 'approved')
    and feature_consent_status = 'accepted'
    and show_on_profile = true
  );
