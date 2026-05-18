// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum withdrawal amount in PHP
const MIN_WITHDRAWAL_AMOUNT = 100;
const WALLET_ACTIVITY_TYPES = new Set([
  'credit',
  'debit',
  'deposit',
  'earning',
  'refund',
  'withdrawal',
]);

const WALLET_ACTIVITY_REFERENCE_TYPES = new Set([
  'booking',
  'booking_payment',
  'booking_downpayment',
  'booking_balance',
  'deposit',
  'refund',
  'withdrawal',
]);

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  );
}

async function hydrateStudioBookingLegacy(supabaseAdmin: any, rows: any[]) {
  const studioIds = uniqueStrings(rows.map((row: any) => row?.studio?.id || row?.studio_id));
  const legacyById = new Map<string, any>();

  if (studioIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('studios_with_stats')
      .select('id, images, location, hourly_rate, rate')
      .in('id', studioIds);

    if (error) throw error;
    (data || []).forEach((row: any) => legacyById.set(row.id, row));
  }

  return rows.map((row: any) => {
    const studioId = row?.studio?.id || row?.studio_id || null;
    const legacy = studioId ? legacyById.get(studioId) : null;

    return {
      ...row,
      studio: row?.studio
        ? {
            ...row.studio,
            id: studioId,
            images: Array.isArray(legacy?.images) ? legacy.images : [],
            location: legacy?.location || row.studio.location || row.studio.address || null,
            rate_per_hour:
              row.studio.rate_per_hour ??
              legacy?.hourly_rate ??
              row.studio.hourly_rate ??
              legacy?.rate ??
              row.studio.rate ??
              null,
          }
        : row?.studio,
    };
  });
}

function normalizeWalletActivityTransaction(tx: any) {
  const rawReferenceType = typeof tx?.reference_type === 'string' ? tx.reference_type.trim() : '';
  const rawType = typeof tx?.type === 'string' ? tx.type.trim().toLowerCase() : '';
  const reference_type =
    rawReferenceType ||
    (WALLET_ACTIVITY_TYPES.has(rawType) ? rawType : null);

  return {
    ...tx,
    reference_type,
  };
}

interface WithdrawalRequest {
  action: string;
  user_id?: string;
  amount?: number;
  payout_method_id?: string;
  payout_type?: string;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  withdrawal_id?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: WithdrawalRequest = await req.json();
    const { action } = body;

    // ============================================================
    // GET WALLET SCREEN SUMMARY
    // ============================================================
    if (action === 'get_wallet_summary') {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      let { data: wallet, error: walletError } = await supabaseAdmin
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (walletError && walletError.code === 'PGRST116') {
        const { data: newWallet, error: createError } = await supabaseAdmin
          .from('wallets')
          .insert([{ user_id: user.id, balance: 0 }])
          .select()
          .single();

        if (createError) throw createError;
        wallet = newWallet;
      } else if (walletError) {
        throw walletError;
      }

      const [
        transactionsResult,
        unpaidBookingsResult,
        payoutMethodsResult,
        withdrawalsResult,
      ] = await Promise.all([
        wallet?.id
          ? supabaseAdmin
              .from('wallet_transactions')
              .select('*')
              .eq('wallet_id', wallet.id)
              .order('created_at', { ascending: false })
              .limit(80)
          : Promise.resolve({ data: [], error: null }),
        supabaseAdmin
          .from('studio_bookings')
          .select('*, studio:studios(id, name, address, hourly_rate, rate)')
          .eq('user_id', user.id)
          .gt('remaining_balance', 0)
          .in('status', ['pending', 'confirmed'])
          .order('booking_date', { ascending: true })
          .limit(30),
        supabaseAdmin
          .from('payout_methods')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false }),
        supabaseAdmin
          .from('withdrawal_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (transactionsResult.error) throw transactionsResult.error;
      if (unpaidBookingsResult.error) throw unpaidBookingsResult.error;
      if (payoutMethodsResult.error) throw payoutMethodsResult.error;
      if (withdrawalsResult.error) throw withdrawalsResult.error;

      const walletActivityTransactions = (transactionsResult.data || [])
        .filter((tx: any) => {
          const rawReferenceType = typeof tx?.reference_type === 'string' ? tx.reference_type.trim() : '';
          const rawType = typeof tx?.type === 'string' ? tx.type.trim().toLowerCase() : '';

          return (
            WALLET_ACTIVITY_TYPES.has(rawType) ||
            WALLET_ACTIVITY_REFERENCE_TYPES.has(rawReferenceType)
          );
        })
        .map(normalizeWalletActivityTransaction);
      const unpaidBookings = await hydrateStudioBookingLegacy(supabaseAdmin, unpaidBookingsResult.data || []);

      return new Response(JSON.stringify({
        success: true,
        role: profile?.role || null,
        wallet,
        balance: wallet?.balance || 0,
        transactions: walletActivityTransactions,
        unpaidBookings,
        payoutMethods: payoutMethodsResult.data || [],
        withdrawals: withdrawalsResult.data || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // GET PAYOUT METHODS
    // ============================================================
    if (action === 'get_payout_methods') {
      const { data: methods, error } = await supabaseAdmin
        .from('payout_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, payout_methods: methods || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // ADD PAYOUT METHOD
    // ============================================================
    if (action === 'add_payout_method') {
      const { payout_type, account_name, account_number, bank_name } = body;

      if (!payout_type || !account_name || !account_number) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const normalizedPayoutType = String(payout_type).trim().toLowerCase();
      if (!['gcash', 'maya', 'bank'].includes(normalizedPayoutType)) {
        return new Response(JSON.stringify({ error: 'Supported payout methods are GCash, Maya, and Bank.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (normalizedPayoutType === 'bank' && !String(bank_name || '').trim()) {
        return new Response(JSON.stringify({ error: 'Bank name is required for bank payouts.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if this is the first payout method (make it default)
      const { count } = await supabaseAdmin
        .from('payout_methods')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const isDefault = (count || 0) === 0;

      const { data: method, error } = await supabaseAdmin
        .from('payout_methods')
        .insert({
          user_id: user.id,
          type: normalizedPayoutType,
          account_name,
          account_number,
          bank_name: normalizedPayoutType === 'bank' ? String(bank_name || '').trim() : null,
          is_default: isDefault
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, payout_method: method }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // SET DEFAULT PAYOUT METHOD
    // ============================================================
    if (action === 'set_default_payout_method') {
      const { payout_method_id } = body;

      if (!payout_method_id) {
        return new Response(JSON.stringify({ error: 'Missing payout_method_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Remove default from all
      await supabaseAdmin
        .from('payout_methods')
        .update({ is_default: false })
        .eq('user_id', user.id);

      // Set new default
      const { error } = await supabaseAdmin
        .from('payout_methods')
        .update({ is_default: true })
        .eq('id', payout_method_id)
        .eq('user_id', user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // DELETE PAYOUT METHOD
    // ============================================================
    if (action === 'delete_payout_method') {
      const { payout_method_id } = body;

      if (!payout_method_id) {
        return new Response(JSON.stringify({ error: 'Missing payout_method_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await supabaseAdmin
        .from('payout_methods')
        .delete()
        .eq('id', payout_method_id)
        .eq('user_id', user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // REQUEST WITHDRAWAL
    // ============================================================
    if (action === 'request_withdrawal') {
      const { amount, payout_method_id } = body;

      if (!amount || amount < MIN_WITHDRAWAL_AMOUNT) {
        return new Response(JSON.stringify({ 
          error: `Minimum withdrawal amount is PHP ${MIN_WITHDRAWAL_AMOUNT}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!payout_method_id) {
        return new Response(JSON.stringify({ error: 'Missing payout_method_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: withdrawalResult, error: withdrawalError } = await supabaseAdmin
        .rpc('process_mock_withdrawal', {
          p_user_id: user.id,
          p_payout_method_id: payout_method_id,
          p_amount: amount,
        });

      if (withdrawalError) {
        console.error('Mock withdrawal failed:', withdrawalError);
        return new Response(JSON.stringify({
          error: withdrawalError.message || 'Withdrawal failed',
          details: withdrawalError.details,
          hint: withdrawalError.hint,
          code: withdrawalError.code,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        ...(withdrawalResult || {}),
        mock_cashout: true,
        withdrawal: withdrawalResult?.withdrawal,
        reference: withdrawalResult?.reference,
        balance: withdrawalResult?.balance,
        message: withdrawalResult?.message || 'Mock cashout successful. The amount was deducted from your real wallet balance; no external transfer was sent.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }


    // ============================================================
    // GET WITHDRAWAL HISTORY
    // ============================================================
    if (action === 'get_withdrawals') {
      const { data: withdrawals, error } = await supabaseAdmin
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, withdrawals: withdrawals || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // CANCEL WITHDRAWAL (only pending)
    // ============================================================
    if (action === 'cancel_withdrawal') {
      const { withdrawal_id } = body;

      if (!withdrawal_id) {
        return new Response(JSON.stringify({ error: 'Missing withdrawal_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get withdrawal request
      const { data: withdrawal, error: getError } = await supabaseAdmin
        .from('withdrawal_requests')
        .select('*')
        .eq('id', withdrawal_id)
        .eq('user_id', user.id)
        .single();

      if (getError || !withdrawal) {
        return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (withdrawal.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Can only cancel pending withdrawals' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update status to cancelled (trigger will handle refund)
      const { error: updateError } = await supabaseAdmin
        .from('withdrawal_requests')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', withdrawal_id);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Withdrawal cancelled and funds returned to wallet' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // REFUND-BASED WITHDRAWAL IS DISABLED
    // ============================================================
    if (action === 'request_withdrawal_refund') {
      return new Response(JSON.stringify({
        error: 'Refund withdrawals are disabled. Use a GCash, Maya, or bank payout method for simulated withdrawals.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // GET ELIGIBLE REFUND PAYMENTS (kept for older clients; always unavailable)
    // ============================================================
    if (action === 'get_refund_eligible_payments') {
      return new Response(JSON.stringify({
        success: true,
        has_eligible_payments: false,
        max_refundable_amount: 0,
        eligible_payments: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Unknown action
    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Withdrawal error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
