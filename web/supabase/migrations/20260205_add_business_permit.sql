-- Migration: Add business_permit_url column to gigs and studios tables
-- This allows venue/studio owners to upload their business permits

-- Add business_permit_url to gigs table
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS business_permit_url TEXT;

-- Add business_permit_url to studios table
ALTER TABLE studios ADD COLUMN IF NOT EXISTS business_permit_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN gigs.business_permit_url IS 'URL to the uploaded business permit document (PDF or image)';
COMMENT ON COLUMN studios.business_permit_url IS 'URL to the uploaded business permit document (PDF or image)';
