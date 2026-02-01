-- Add type column to studios table
ALTER TABLE studios ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('Rehearsal', 'Recording'));

-- Drop view first to avoid "cannot change name of view column" error due to column shifting
DROP VIEW IF EXISTS studios_with_stats;

-- Recreate view with explicit columns to ensure stability (though maintain * for now as originally planned)
CREATE OR REPLACE VIEW studios_with_stats AS
SELECT 
  s.*,
  COALESCE(r.rating, 0) AS rating,
  COALESCE(r.review_count, 0) AS review_count,
  COALESCE(b.completion_rate, 100) AS completion_rate
FROM studios s
LEFT JOIN (
  SELECT studio_id, AVG(rating) as rating, COUNT(id) as review_count
  FROM reviews
  GROUP BY studio_id
) r ON r.studio_id = s.id
LEFT JOIN (
  SELECT studio_id,
         CASE 
           WHEN COUNT(id) = 0 THEN 100
           ELSE ROUND((COUNT(CASE WHEN status = 'completed' THEN 1 END)::NUMERIC / COUNT(id)::NUMERIC) * 100, 0)
         END as completion_rate
  FROM studio_bookings
  WHERE status IN ('completed', 'cancelled')
  GROUP BY studio_id
) b ON b.studio_id = s.id;

-- Grant permissions (just in case they were lost on drop)
GRANT SELECT ON studios_with_stats TO anon, authenticated, service_role;
