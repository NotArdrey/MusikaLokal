-- CONTRACT PHASE (DESTRUCTIVE) PLAN
-- Do NOT run until:
--  1) Application write paths no longer write legacy columns.
--  2) Read paths no longer depend on legacy columns.
--  3) select * from public.contract_3nf_preflight() shows all *_nonempty = 0 and all dup/orphan = 0.

-- Recommended execution order:
--   A) Null legacy payloads in batches (or one-off if small data).
--   B) Observe for at least one release window.
--   C) Drop legacy columns in separate migration.

-- =========================================
-- A) Null legacy payloads (example one-off)
-- =========================================
-- update public.profiles
-- set skills = null,
--     genres = null,
--     portfolio_urls = null
-- where coalesce(array_length(skills,1),0) > 0
--    or coalesce(array_length(genres,1),0) > 0
--    or coalesce(array_length(portfolio_urls,1),0) > 0;

-- update public.gigs
-- set requirements = '{}'::jsonb,
--     images = '{}'::text[],
--     documents = '{}'::text[]
-- where (requirements is not null and requirements <> '{}'::jsonb)
--    or coalesce(array_length(images,1),0) > 0
--    or coalesce(array_length(documents,1),0) > 0;

-- update public.studios
-- set amenities = '{}'::text[],
--     images = '{}'::text[],
--     instruments = '[]'::jsonb,
--     types = '{}'::text[],
--     type = null
-- where coalesce(array_length(amenities,1),0) > 0
--    or coalesce(array_length(images,1),0) > 0
--    or (instruments is not null and instruments <> '[]'::jsonb)
--    or coalesce(array_length(types,1),0) > 0
--    or type is not null;

-- =========================================
-- B) Re-run preflight and shadow checks
-- =========================================
-- select * from public.contract_3nf_preflight();

-- =========================================
-- C) Drop legacy columns (only when safe)
-- =========================================
-- alter table public.profiles
--   drop column if exists skills,
--   drop column if exists genres,
--   drop column if exists portfolio_urls;

-- alter table public.gigs
--   drop column if exists requirements,
--   drop column if exists images,
--   drop column if exists documents;

-- alter table public.studios
--   drop column if exists amenities,
--   drop column if exists images,
--   drop column if exists instruments,
--   drop column if exists types,
--   drop column if exists type;
