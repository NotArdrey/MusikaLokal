-- Guardrail checks to run during Phase 2/3/4 (backfill, dual-write, shadow-read)

-- 1) Row-count parity between legacy and normalized.
SELECT * FROM migration_row_count_parity();

-- 2) Duplicate detection in normalized tables (should be 0 for each domain).
SELECT * FROM migration_duplicate_check();

-- 3) Orphan checks (FK-like drift check beyond constraints).
SELECT 'profile_skills_orphans' AS domain, COUNT(*) AS orphan_rows
FROM profile_skills ps
LEFT JOIN profiles p ON p.id = ps.profile_id
WHERE p.id IS NULL
UNION ALL
SELECT 'profile_genres_orphans', COUNT(*)
FROM profile_genres pg
LEFT JOIN profiles p ON p.id = pg.profile_id
WHERE p.id IS NULL
UNION ALL
SELECT 'profile_portfolio_orphans', COUNT(*)
FROM profile_portfolio_urls ppu
LEFT JOIN profiles p ON p.id = ppu.profile_id
WHERE p.id IS NULL
UNION ALL
SELECT 'gig_requirements_orphans', COUNT(*)
FROM gig_requirements gr
LEFT JOIN gigs g ON g.id = gr.gig_id
WHERE g.id IS NULL
UNION ALL
SELECT 'gig_media_orphans', COUNT(*)
FROM gig_media gm
LEFT JOIN gigs g ON g.id = gm.gig_id
WHERE g.id IS NULL
UNION ALL
SELECT 'studio_amenities_orphans', COUNT(*)
FROM studio_amenities sa
LEFT JOIN studios s ON s.id = sa.studio_id
WHERE s.id IS NULL
UNION ALL
SELECT 'studio_media_orphans', COUNT(*)
FROM studio_media sm
LEFT JOIN studios s ON s.id = sm.studio_id
WHERE s.id IS NULL;
