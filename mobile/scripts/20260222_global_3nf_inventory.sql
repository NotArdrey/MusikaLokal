-- Global 3NF inventory (base tables only)
-- Purpose: identify remaining JSON/ARRAY columns and dependency surface

-- 1) Base table columns that are ARRAY/JSON/JSONB
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND c.data_type IN ('ARRAY', 'json', 'jsonb')
ORDER BY c.table_name, c.column_name;

-- 2) Dependency map for candidate denormalized columns
WITH candidate_cols AS (
  SELECT 'public.groups'::regclass AS relid, unnest(ARRAY['members','images']) AS col
  UNION ALL SELECT 'public.studio_bookings'::regclass, unnest(ARRAY['time_slots'])
  UNION ALL SELECT 'public.gigs'::regclass, unnest(ARRAY['availability','slots_filled'])
  UNION ALL SELECT 'public.studios'::regclass, unnest(ARRAY['availability','open_dates'])
)
SELECT DISTINCT
  cc.relid::regclass::text AS table_name,
  cc.col AS column_name,
  n.nspname AS dependent_schema,
  obj.relname AS dependent_object,
  obj.relkind AS dependent_kind
FROM candidate_cols cc
JOIN pg_attribute a
  ON a.attrelid = cc.relid
 AND a.attname = cc.col
JOIN pg_depend d
  ON d.refobjid = a.attrelid
 AND d.refobjsubid = a.attnum
 AND d.deptype = 'n'
JOIN pg_rewrite rw
  ON rw.oid = d.objid
JOIN pg_class obj
  ON obj.oid = rw.ev_class
JOIN pg_namespace n
  ON n.oid = obj.relnamespace
ORDER BY table_name, column_name, dependent_schema, dependent_object;

-- 3) Quick per-table summary for sprint planning
SELECT
  c.table_name,
  array_agg(c.column_name ORDER BY c.column_name) AS json_or_array_columns,
  count(*) AS column_count
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND c.data_type IN ('ARRAY', 'json', 'jsonb')
GROUP BY c.table_name
ORDER BY column_count DESC, c.table_name;