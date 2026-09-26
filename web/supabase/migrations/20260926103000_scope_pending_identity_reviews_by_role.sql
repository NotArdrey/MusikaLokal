-- Keep pending identity reviews separate for each role on a multi-role account.
drop index if exists public.idx_manual_identity_reviews_pending_manual_unique;
create unique index idx_manual_identity_reviews_pending_manual_unique
  on public.manual_identity_reviews (user_id, submitted_role)
  where status = 'PENDING_REVIEW' and source = 'MANUAL_UPLOAD';

drop index if exists public.idx_manual_identity_reviews_pending_user_source_unique;
create unique index idx_manual_identity_reviews_pending_user_source_unique
  on public.manual_identity_reviews (user_id, source, submitted_role)
  where status = 'PENDING_REVIEW' and source <> 'COPYRIGHT_OWNERSHIP';

