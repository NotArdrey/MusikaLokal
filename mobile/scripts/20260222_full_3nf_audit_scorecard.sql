-- Full 3NF audit scorecard (base tables only)
-- Purpose: repeatable, operator-friendly checks for remaining normalization work.

-- =====================================================
-- A) Baseline: table count and PK coverage
-- =====================================================
WITH base_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
), pk_tables AS (
  SELECT DISTINCT tc.table_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'PRIMARY KEY'
)
SELECT
  (SELECT COUNT(*) FROM base_tables) AS base_table_count,
  (SELECT COUNT(*) FROM pk_tables) AS base_tables_with_pk,
  (SELECT COUNT(*) FROM base_tables b LEFT JOIN pk_tables p ON p.table_name = b.table_name WHERE p.table_name IS NULL) AS base_tables_missing_pk;

-- =====================================================
-- B) Columns that likely need normalization review
-- =====================================================
WITH base_cols AS (
  SELECT c.table_name, c.column_name, c.data_type, c.udt_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name = c.table_name
  WHERE c.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
)
SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  CASE
    WHEN column_name IN ('raw_response','verification_result','verification_data') THEN 'ACCEPTABLE_EXTERNAL_PAYLOAD'
    WHEN table_name LIKE '%_deletion_audit' THEN 'ACCEPTABLE_AUDIT_SNAPSHOT'
    WHEN column_name ~* '(availability|open_dates|slots_filled|metadata|raw_member)' THEN 'REVIEW_NORMALIZE'
    WHEN column_name ~* '(event_details|features|modifiers_applied|peak_season_dates|off_peak_dates|meta)' THEN 'REVIEW_EXCEPTION_DOC'
    WHEN data_type IN ('json','jsonb','ARRAY') THEN 'REVIEW_UNCLASSIFIED'
    ELSE 'INFO'
  END AS classification_hint
FROM base_cols
WHERE data_type IN ('json','jsonb','ARRAY')
   OR column_name ~* '(details|payload|metadata|snapshot|availability|open_dates|slots_filled|features|modifiers_applied|peak_season_dates|off_peak_dates|raw_member|meta)'
ORDER BY
  CASE
    WHEN column_name ~* '(availability|open_dates|slots_filled|metadata|raw_member)' THEN 0
    ELSE 1
  END,
  table_name,
  column_name;

-- =====================================================
-- C) Potential transitive dependency indicators
-- =====================================================
WITH base_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
), cols AS (
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN base_tables b ON b.table_name = c.table_name
  WHERE c.table_schema = 'public'
)
SELECT
  c1.table_name,
  c1.column_name AS likely_derived_name_column,
  REPLACE(c1.column_name, '_name', '_id') AS related_id_column
FROM cols c1
JOIN cols c2
  ON c2.table_name = c1.table_name
 AND c2.column_name = REPLACE(c1.column_name, '_name', '_id')
WHERE c1.column_name LIKE '%\_name' ESCAPE '\\'
ORDER BY c1.table_name, c1.column_name;

-- =====================================================
-- D) ID columns not constrained as FK (review only)
-- =====================================================
WITH base_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
), id_cols AS (
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN base_tables b ON b.table_name = c.table_name
  WHERE c.table_schema = 'public'
    AND c.column_name LIKE '%\_id' ESCAPE '\\'
), fk_cols AS (
  SELECT kcu.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
)
SELECT
  i.table_name,
  i.column_name AS unconstrained_id_column,
  CASE
    WHEN i.column_name IN ('payment_intent_id','checkout_session_id','refund_id','session_id','smile_user_id','archive_id','reference_id','didit_session_id')
      THEN 'LIKELY_EXTERNAL_ID'
    ELSE 'REVIEW_FK_OR_RENAME'
  END AS review_hint
FROM id_cols i
LEFT JOIN fk_cols f
  ON f.table_name = i.table_name
 AND f.column_name = i.column_name
WHERE f.column_name IS NULL
ORDER BY i.table_name, i.column_name;

-- =====================================================
-- E) Remaining high-priority domain candidates
-- =====================================================
SELECT *
FROM (
  VALUES
    ('conversations', 'group_name', 'P0', 'Remove from write model or document as read-model cache'),
    ('gigs', 'availability', 'P0', 'Normalize if schedule constraints/querying required'),
    ('gigs', 'slots_filled', 'P0', 'Normalize if per-slot occupancy analytics required'),
    ('groups', 'availability', 'P1', 'Normalize if schedule querying required'),
    ('studios', 'availability', 'P0', 'Normalize for booking integrity constraints'),
    ('studios', 'open_dates', 'P0', 'Normalize to date rows if date constraints/reporting required'),
    ('group_roster_members', 'metadata', 'P1', 'Split persistent business attributes to typed columns'),
    ('group_roster_members', 'raw_member', 'P2', 'Keep only as migration trace payload if needed')
) AS t(table_name, column_name, priority, recommended_action)
ORDER BY priority, table_name, column_name;
