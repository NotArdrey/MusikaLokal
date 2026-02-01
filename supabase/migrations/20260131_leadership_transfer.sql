-- Migration: Leadership Transfer Feature
-- Enables group owners to transfer leadership with confirmation from new leader

-- ============================================================
-- 1. Create leadership_transfer_requests table
-- ============================================================
CREATE TABLE IF NOT EXISTS leadership_transfer_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  responded_at TIMESTAMP WITH TIME ZONE
);

-- Only one pending request per group at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_leadership_transfer_pending 
  ON leadership_transfer_requests(group_id) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE leadership_transfer_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. RLS Policies
-- ============================================================

-- Users can view requests where they are sender or recipient
DROP POLICY IF EXISTS "Users can view their transfer requests" ON leadership_transfer_requests;
CREATE POLICY "Users can view their transfer requests"
  ON leadership_transfer_requests FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Only group owners can create transfer requests
DROP POLICY IF EXISTS "Owners can create transfer requests" ON leadership_transfer_requests;
CREATE POLICY "Owners can create transfer requests"
  ON leadership_transfer_requests FOR INSERT TO authenticated
  WITH CHECK (
    from_user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM groups WHERE id = group_id AND owner_id = auth.uid())
  );

-- Recipients can update (accept/decline) pending requests
DROP POLICY IF EXISTS "Recipient can respond to transfer" ON leadership_transfer_requests;
CREATE POLICY "Recipient can respond to transfer"
  ON leadership_transfer_requests FOR UPDATE TO authenticated
  USING (
    (to_user_id = auth.uid() AND status = 'pending') OR
    (from_user_id = auth.uid() AND status = 'pending')
  );

-- ============================================================
-- 3. Function to accept leadership transfer (atomic operation)
-- ============================================================
CREATE OR REPLACE FUNCTION accept_leadership_transfer(request_id UUID)
RETURNS void AS $$
DECLARE
  req RECORD;
BEGIN
  -- Get request details
  SELECT * INTO req FROM leadership_transfer_requests WHERE id = request_id;
  
  IF req IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;
  
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is no longer pending';
  END IF;
  
  IF req.to_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can accept this transfer';
  END IF;
  
  -- Update request status
  UPDATE leadership_transfer_requests 
  SET status = 'accepted', responded_at = NOW() 
  WHERE id = request_id;
  
  -- Transfer ownership in groups table
  UPDATE groups SET owner_id = req.to_user_id WHERE id = req.group_id;
  
  -- Update roles in group_members: demote old owner to member (ensure they are in table)
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (req.group_id, req.from_user_id, 'member')
  ON CONFLICT (group_id, user_id) 
  DO UPDATE SET role = 'member';
  
  -- Promote new owner
  UPDATE group_members SET role = 'owner' 
  WHERE group_id = req.group_id AND user_id = req.to_user_id;
  
  -- If new owner wasn't in group_members, add them
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (req.group_id, req.to_user_id, 'owner')
  ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner';
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Function to decline leadership transfer
-- ============================================================
CREATE OR REPLACE FUNCTION decline_leadership_transfer(request_id UUID)
RETURNS void AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM leadership_transfer_requests WHERE id = request_id;
  
  IF req IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;
  
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is no longer pending';
  END IF;
  
  IF req.to_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can decline this transfer';
  END IF;
  
  UPDATE leadership_transfer_requests 
  SET status = 'declined', responded_at = NOW() 
  WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Function to cancel leadership transfer (by sender)
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_leadership_transfer(request_id UUID)
RETURNS void AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM leadership_transfer_requests WHERE id = request_id;
  
  IF req IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;
  
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is no longer pending';
  END IF;
  
  IF req.from_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the sender can cancel this transfer';
  END IF;
  
  UPDATE leadership_transfer_requests 
  SET status = 'cancelled', responded_at = NOW() 
  WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_from ON leadership_transfer_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_to ON leadership_transfer_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_group ON leadership_transfer_requests(group_id);
