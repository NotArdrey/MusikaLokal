-- ============================================================
-- WITHDRAWAL SYSTEM TABLES
-- ============================================================

-- Payout Methods (Bank accounts, E-wallets like GCash, Maya, etc.)
CREATE TABLE IF NOT EXISTS payout_methods (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('bank', 'gcash', 'maya', 'paypal')) NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT, -- Only for bank type (e.g., BDO, BPI, Metrobank)
  is_default BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Withdrawal Requests
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE NOT NULL,
  payout_method_id UUID REFERENCES payout_methods(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  fee NUMERIC DEFAULT 0,
  net_amount NUMERIC NOT NULL, -- amount - fee
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) NOT NULL,
  payout_type TEXT NOT NULL, -- 'bank', 'gcash', 'maya', 'paypal'
  payout_account_name TEXT NOT NULL,
  payout_account_number TEXT NOT NULL,
  payout_bank_name TEXT,
  reference_number TEXT, -- External reference from payment provider
  notes TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES profiles(id),
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payout_methods_user ON payout_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet ON withdrawal_requests(wallet_id);

-- RLS Policies
ALTER TABLE payout_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Payout Methods Policies
CREATE POLICY "Users can view their own payout methods"
  ON payout_methods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payout methods"
  ON payout_methods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payout methods"
  ON payout_methods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own payout methods"
  ON payout_methods FOR DELETE
  USING (auth.uid() = user_id);

-- Withdrawal Requests Policies
CREATE POLICY "Users can view their own withdrawal requests"
  ON withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create withdrawal requests"
  ON withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can cancel their pending withdrawal requests"
  ON withdrawal_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Function to update wallet balance on withdrawal
CREATE OR REPLACE FUNCTION process_withdrawal_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- When withdrawal is completed, the balance was already deducted at request time
  -- This function handles status changes
  IF NEW.status = 'failed' OR NEW.status = 'cancelled' THEN
    -- Refund the amount back to wallet
    UPDATE wallets 
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.wallet_id;
    
    -- Create refund transaction
    INSERT INTO wallet_transactions (wallet_id, amount, type, description, reference_id, is_credit, status)
    VALUES (NEW.wallet_id, NEW.amount, 'refund', 
            CASE 
              WHEN NEW.status = 'failed' THEN 'Withdrawal failed - ' || COALESCE(NEW.failure_reason, 'Unknown error')
              ELSE 'Withdrawal cancelled'
            END,
            NEW.id, TRUE, 'completed');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for withdrawal status changes
DROP TRIGGER IF EXISTS on_withdrawal_status_change ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_status_change
  AFTER UPDATE OF status ON withdrawal_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION process_withdrawal_balance();
