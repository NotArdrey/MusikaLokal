-- Migration: Add cv_url to gig_applications
-- Description: Adds a column to store the URL of the uploaded CV/Resume.

ALTER TABLE gig_applications 
ADD COLUMN IF NOT EXISTS cv_url TEXT;

COMMENT ON COLUMN gig_applications.cv_url IS 'URL to the applicant''s CV or Resume';
