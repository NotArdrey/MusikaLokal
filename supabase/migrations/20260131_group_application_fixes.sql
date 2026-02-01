-- Migration: Group Application Logic Fixes
-- Description: Adds group_members table, is_solo_application field, and unique constraint for group applications

-- ============================================================
-- 1. Create group_members junction table for proper member tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS group_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE(group_id, user_id)
);

-- Enable RLS
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Everyone can view memberships (needed for application checks)
CREATE POLICY "Anyone can view group memberships"
  ON group_members FOR SELECT TO authenticated
  USING (TRUE);

-- Members can insert themselves (for join requests) or owners can add
CREATE POLICY "Users can join groups or owners can add members"
  ON group_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM groups WHERE id = group_members.group_id AND owner_id = auth.uid()
    )
  );

-- Only group owners can update member roles
CREATE POLICY "Owners can update member roles"
  ON group_members FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups WHERE id = group_members.group_id AND owner_id = auth.uid()
    )
  );

-- Users can leave groups or owners can remove members
CREATE POLICY "Users can leave or owners can remove members"
  ON group_members FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM groups WHERE id = group_members.group_id AND owner_id = auth.uid()
    )
  );

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

-- ============================================================
-- 2. Add is_solo_application to gig_applications
-- ============================================================
ALTER TABLE gig_applications 
  ADD COLUMN IF NOT EXISTS is_solo_application BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN gig_applications.is_solo_application IS 'True if user applied as individual, false if applied as part of a group';

-- ============================================================
-- 3. Add unique constraint to prevent duplicate group applications
-- ============================================================
-- Only one non-rejected application per group per gig
CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_applications_unique_group 
  ON gig_applications(gig_id, group_id) 
  WHERE group_id IS NOT NULL AND status != 'rejected';

-- ============================================================
-- 4. Migrate existing groups: Add owners as members with 'owner' role
-- ============================================================
INSERT INTO group_members (group_id, user_id, role)
SELECT id, owner_id, 'owner' FROM groups
ON CONFLICT (group_id, user_id) DO NOTHING;

-- ============================================================
-- 5. Update existing gig_applications: Set is_solo_application based on group_id
-- ============================================================
UPDATE gig_applications 
SET is_solo_application = (group_id IS NULL)
WHERE is_solo_application IS NULL OR is_solo_application = FALSE;
