-- Migration: Add instruments JSONB column to studios table
-- Description: Stores instrument data with name and image URL pairs

ALTER TABLE studios ADD COLUMN IF NOT EXISTS instruments JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN studios.instruments IS 'JSON array of instruments with format: [{name: string, image: string}]';
