insert into public.normalization_exceptions (table_name, column_name, rationale)
values
  ('address_verification_sessions', 'raw_response', 'Provider response envelope retained for compliance/debug traceability.'),
  ('address_verification_sessions', 'verification_result', 'Verification decision payload retained as provider-origin document.'),
  ('gig_deletion_audit', 'gig_snapshot', 'Immutable audit snapshot retained for forensic recovery and compliance.'),
  ('gig_deletion_audit', 'related_counts', 'Audit summary payload retained for deletion event evidence.'),
  ('gig_deletion_audit', 'applicant_counts', 'Audit summary payload retained for deletion event evidence.'),
  ('gig_deletion_audit', 'storage_cleanup', 'Storage cleanup result payload retained for operational auditability.'),
  ('gig_requirements', 'requirement_value', 'Typed requirement payload stored as document value keyed by requirement type.'),
  ('group_deletion_audit', 'group_snapshot', 'Immutable audit snapshot retained for forensic recovery and compliance.'),
  ('group_deletion_audit', 'related_counts', 'Audit summary payload retained for deletion event evidence.'),
  ('group_deletion_audit', 'application_counts', 'Audit summary payload retained for deletion event evidence.'),
  ('notifications', 'meta', 'Flexible notification context payload used for event-specific rendering.'),
  ('studio_deletion_audit', 'studio_snapshot', 'Immutable audit snapshot retained for forensic recovery and compliance.'),
  ('studio_deletion_audit', 'related_counts', 'Audit summary payload retained for deletion event evidence.'),
  ('studio_deletion_audit', 'storage_cleanup', 'Storage cleanup result payload retained for operational auditability.'),
  ('verification_sessions', 'verification_data', 'Provider verification payload retained for compliance and troubleshooting.')
on conflict (table_name, column_name) do update
set rationale = excluded.rationale,
    approved_at = now();