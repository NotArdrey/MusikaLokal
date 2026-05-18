-- wallet_deposits: tracks PayMongo checkout sessions created for wallet top-ups
-- The paymongo edge function check_deposit action uses this for idempotency.

CREATE TABLE IF NOT EXISTS public.wallet_deposits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkout_session_id text NOT NULL UNIQUE,
  amount      numeric NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'pending', -- pending | completed | failed
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_deposits ENABLE ROW LEVEL SECURITY;

-- Users can only see their own deposits
CREATE POLICY "Users can view own deposits"
  ON public.wallet_deposits FOR SELECT
  USING (auth.uid() = user_id);

-- Edge functions (service role) can insert/update
CREATE POLICY "Service role can manage deposits"
  ON public.wallet_deposits FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_user_id ON public.wallet_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_deposits_session ON public.wallet_deposits(checkout_session_id);
