-- Add cv_url column to gig_applications table
ALTER TABLE gig_applications
ADD COLUMN IF NOT EXISTS cv_url TEXT;

COMMENT ON COLUMN gig_applications.cv_url IS 'URL to the uploaded CV file';
