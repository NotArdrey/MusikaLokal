// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PayMongo API configuration
const PAYMONGO_SECRET_KEY = Deno.env.get('PAYMONGO_SECRET_KEY') || '';
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

// Minimum withdrawal amount in PHP
const MIN_WITHDRAWAL_AMOUNT = 100;
// Withdrawal fee (can be percentage or fixed)
const WITHDRAWAL_FEE_PERCENTAGE = 0; // 0% fee for now
const FIXED_WITHDRAWAL_FEE = 0; // No fixed fee

// Bank codes for PayMongo disbursements
const BANK_CODES: Record<string, string> = {
  'bdo': 'BDO',
  'bpi': 'BPI',
  'metrobank': 'MBTC',
  'landbank': 'LBP',
  'unionbank': 'UBP',
  'pnb': 'PNB',
  'chinabank': 'CBC',
  'rcbc': 'RCBC',
  'security bank': 'SBC',
  'eastwest': 'EWB',
  'psbank': 'PSB',
  'robinsons bank': 'RSB',
  'cimb': 'CIMB',
  'ing': 'ING',
  'maybank': 'MBB',
  'hsbc': 'HSBC',
  'citibank': 'CITI',
  'standard chartered': 'SCPG',
  'aub': 'AUB',
  'pbcom': 'PBCOM',
  'ucpb': 'UCPB',
  'ctbc': 'CTBC',
};

// Helper function to create a PayMongo refund (no ID required)
async function createPayMongoRefund(
  paymentId: string,
  amount: number,
  reason: string
): Promise<{ success: boolean; refund_id?: string; error?: string }> {
  try {
    console.log('💸 Creating PayMongo refund:', { paymentId, amount, reason });

    // PayMongo Refund API: POST /v1/refunds
    // Docs: https://developers.paymongo.com/reference/create-a-refund
    const response = await fetch(`${PAYMONGO_API_URL}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(PAYMONGO_SECRET_KEY + ':')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount * 100), // Convert to centavos (PHP * 100)
            payment_id: paymentId,            // Required: The payment ID to refund
            reason: 'requested_by_customer',  // Required: One of: duplicate, fraudulent, requested_by_customer, others
            notes: reason,                    // Optional: Additional notes
          }
        }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ PayMongo Refund Error:', JSON.stringify(data, null, 2));
      const errorMessage = data.errors?.[0]?.detail || data.errors?.[0]?.code || 'Refund failed';
      return { success: false, error: errorMessage };
    }

    console.log('✅ PayMongo Refund Success:', data.data.id);
    return { 
      success: true, 
      refund_id: data.data.id 
    };
  } catch (error: any) {
    console.error('❌ PayMongo Refund Exception:', error);
    return { success: false, error: error.message || 'Failed to process refund' };
  }
}

// Helper function to get payment details from checkout session
async function getPaymentFromCheckoutSession(
  checkoutSessionId: string
): Promise<{ payment_id: string | null; payment_method: string | null; amount: number }> {
  try {
    const response = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${checkoutSessionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(PAYMONGO_SECRET_KEY + ':')}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok || !data.data) {
      return { payment_id: null, payment_method: null, amount: 0 };
    }

    const payments = data.data.attributes?.payments || [];
    if (payments.length > 0) {
      const payment = payments[0];
      return {
        payment_id: payment.id,
        payment_method: payment.attributes?.source?.type || null,
        amount: payment.attributes?.amount ? payment.attributes.amount / 100 : 0,
      };
    }

    return { payment_id: null, payment_method: null, amount: 0 };
  } catch (error) {
    console.error('Error fetching checkout session:', error);
    return { payment_id: null, payment_method: null, amount: 0 };
  }
}

// Helper function to call PayMongo Disbursements API
async function createPayMongoDisbursement(
  amount: number,
  payoutType: string,
  accountName: string,
  accountNumber: string,
  bankName?: string,
  description?: string
): Promise<{ success: boolean; reference?: string; error?: string }> {
  try {
    // Build disbursement method based on type
    let disbursementMethod: any = {
      type: payoutType, // 'gcash', 'maya', or 'bank'
    };

    if (payoutType === 'gcash' || payoutType === 'maya') {
      disbursementMethod = {
        type: payoutType,
        account_name: accountName,
        account_number: accountNumber.replace(/\s/g, ''), // Remove spaces
      };
    } else if (payoutType === 'bank') {
      // Find bank code
      const bankLower = (bankName || '').toLowerCase();
      let bankCode = 'BDO'; // Default
      for (const [key, code] of Object.entries(BANK_CODES)) {
        if (bankLower.includes(key)) {
          bankCode = code;
          break;
        }
      }
      
      disbursementMethod = {
        type: 'bank',
        bank_code: bankCode,
        account_name: accountName,
        account_number: accountNumber.replace(/\s/g, ''),
      };
    }

    const response = await fetch(`${PAYMONGO_API_URL}/disbursements`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(PAYMONGO_SECRET_KEY + ':')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount * 100), // Convert to centavos
            description: description || 'Wallet withdrawal',
            disbursement_method: disbursementMethod,
            statement_descriptor: 'MUSIKALOKAL',
          }
        }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PayMongo Disbursement Error:', JSON.stringify(data, null, 2));
      const errorMessage = data.errors?.[0]?.detail || data.errors?.[0]?.code || 'Disbursement failed';
      return { success: false, error: errorMessage };
    }

    console.log('✅ PayMongo Disbursement Success:', data.data.id);
    return { 
      success: true, 
      reference: data.data.id 
    };
  } catch (error: any) {
    console.error('❌ PayMongo Disbursement Exception:', error);
    return { success: false, error: error.message || 'Failed to process payout' };
  }
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
          type: payout_type,
          account_name,
          account_number,
          bank_name: payout_type === 'bank' ? bank_name : null,
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
          error: `Minimum withdrawal amount is ₱${MIN_WITHDRAWAL_AMOUNT}` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get user's wallet
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (walletError || !wallet) {
        return new Response(JSON.stringify({ error: 'Wallet not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check sufficient balance
      if (wallet.balance < amount) {
        return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get payout method
      const { data: payoutMethod, error: methodError } = await supabaseAdmin
        .from('payout_methods')
        .select('*')
        .eq('id', payout_method_id)
        .eq('user_id', user.id)
        .single();

      if (methodError || !payoutMethod) {
        return new Response(JSON.stringify({ error: 'Payout method not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Calculate fee
      const fee = FIXED_WITHDRAWAL_FEE + (amount * WITHDRAWAL_FEE_PERCENTAGE / 100);
      const netAmount = amount - fee;

      // ========================================
      // CALL PAYMONGO DISBURSEMENTS API
      // ========================================
      console.log('📤 Initiating PayMongo disbursement...');
      console.log(`Amount: ₱${netAmount}, Type: ${payoutMethod.type}, Account: ${payoutMethod.account_number}`);

      const disbursementResult = await createPayMongoDisbursement(
        netAmount,
        payoutMethod.type,
        payoutMethod.account_name,
        payoutMethod.account_number,
        payoutMethod.bank_name,
        `MusikaLokal withdrawal for ${user.email}`
      );

      if (!disbursementResult.success) {
        console.error('❌ PayMongo disbursement failed:', disbursementResult.error);
        return new Response(JSON.stringify({ 
          error: disbursementResult.error || 'Payout failed. Please try again or contact support.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ PayMongo disbursement successful! Reference:', disbursementResult.reference);

      // ========================================
      // DISBURSEMENT SUCCESS - UPDATE DATABASE
      // ========================================

      // 1. Deduct from wallet
      const { error: deductError } = await supabaseAdmin
        .from('wallets')
        .update({ 
          balance: wallet.balance - amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', wallet.id);

      if (deductError) throw deductError;

      // 2. Create wallet transaction (completed)
      const { data: transaction, error: txError } = await supabaseAdmin
        .from('wallet_transactions')
        .insert({
          wallet_id: wallet.id,
          amount: amount,
          type: 'withdrawal',
          description: `Withdrawal to ${payoutMethod.type.toUpperCase()} - ****${payoutMethod.account_number.slice(-4)}`,
          is_credit: false,
          status: 'completed'
        })
        .select()
        .single();

      if (txError) throw txError;

      // 3. Create withdrawal request (completed)
      const { data: withdrawal, error: withdrawError } = await supabaseAdmin
        .from('withdrawal_requests')
        .insert({
          user_id: user.id,
          wallet_id: wallet.id,
          payout_method_id: payoutMethod.id,
          amount: amount,
          fee: fee,
          net_amount: netAmount,
          payout_type: payoutMethod.type,
          payout_account_name: payoutMethod.account_name,
          payout_account_number: payoutMethod.account_number,
          payout_bank_name: payoutMethod.bank_name,
          status: 'completed',
          reference_number: disbursementResult.reference,
          processed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (withdrawError) {
        // Rollback wallet balance (disbursement already sent, but we need to track it)
        console.error('❌ Failed to create withdrawal record, but disbursement was sent!', withdrawError);
        // Still insert a record to track the disbursement
        await supabaseAdmin
          .from('withdrawal_requests')
          .insert({
            user_id: user.id,
            wallet_id: wallet.id,
            amount: amount,
            fee: fee,
            net_amount: netAmount,
            payout_type: payoutMethod.type,
            payout_account_name: payoutMethod.account_name,
            payout_account_number: payoutMethod.account_number,
            status: 'completed',
            reference_number: disbursementResult.reference,
            notes: 'Auto-created after DB error',
            processed_at: new Date().toISOString()
          });
      }

      // Update transaction with reference
      if (withdrawal) {
        await supabaseAdmin
          .from('wallet_transactions')
          .update({ reference_id: withdrawal.id })
          .eq('id', transaction.id);
      }

      console.log('✅ Withdrawal completed successfully:', withdrawal?.id || 'recovery mode');

      return new Response(JSON.stringify({ 
        success: true, 
        withdrawal: withdrawal,
        reference: disbursementResult.reference,
        message: `₱${netAmount.toLocaleString()} has been sent to your ${payoutMethod.type.toUpperCase()} account!`
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
    // REQUEST WITHDRAWAL VIA REFUND (No ID verification required)
    // Uses PayMongo refunds on eligible subscription payments
    // ============================================================
    if (action === 'request_withdrawal_refund') {
      const { amount } = body;

      if (!amount || amount < MIN_WITHDRAWAL_AMOUNT) {
        return new Response(JSON.stringify({ 
          error: `Minimum withdrawal amount is ₱${MIN_WITHDRAWAL_AMOUNT}` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get user's wallet
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (walletError || !wallet) {
        return new Response(JSON.stringify({ error: 'Wallet not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check sufficient balance
      if (wallet.balance < amount) {
        return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Calculate fee
      const fee = FIXED_WITHDRAWAL_FEE + (amount * WITHDRAWAL_FEE_PERCENTAGE / 100);
      const netAmount = amount - fee;

      // Find an eligible payment to refund
      // Priority 1: User's own subscription payments (goes back to their own account)
      const { data: subPayments } = await supabaseAdmin
        .from('subscription_payments')
        .select('checkout_session_id, amount, paid_at')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .not('checkout_session_id', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(5);

      let paymentId: string | null = null;
      let paymentSource: string = '';
      let refundableAmount = 0;

      // Check subscription payments for a valid payment ID
      if (subPayments && subPayments.length > 0) {
        for (const payment of subPayments) {
          if (payment.checkout_session_id) {
            const paymentInfo = await getPaymentFromCheckoutSession(payment.checkout_session_id);
            if (paymentInfo.payment_id && paymentInfo.amount >= netAmount) {
              paymentId = paymentInfo.payment_id;
              paymentSource = 'subscription';
              refundableAmount = paymentInfo.amount;
              console.log('✅ Found eligible subscription payment:', paymentId);
              break;
            }
          }
        }
      }

      // Priority 2: Check bookings user made (studio rentals they paid for)
      if (!paymentId) {
        const { data: bookingPayments } = await supabaseAdmin
          .from('studio_bookings')
          .select('checkout_session_id, payment_amount, paid_at, studio:studios(name)')
          .eq('user_id', user.id)
          .eq('payment_status', 'paid')
          .not('checkout_session_id', 'is', null)
          .order('paid_at', { ascending: false })
          .limit(5);

        if (bookingPayments && bookingPayments.length > 0) {
          for (const booking of bookingPayments) {
            if (booking.checkout_session_id) {
              const paymentInfo = await getPaymentFromCheckoutSession(booking.checkout_session_id);
              if (paymentInfo.payment_id && paymentInfo.amount >= netAmount) {
                paymentId = paymentInfo.payment_id;
                paymentSource = 'booking';
                refundableAmount = paymentInfo.amount;
                console.log('✅ Found eligible booking payment:', paymentId);
                break;
              }
            }
          }
        }
      }

      if (!paymentId) {
        return new Response(JSON.stringify({ 
          error: 'No eligible payments found for refund-based withdrawal. You can use the regular withdrawal method with a payout account instead.',
          suggestion: 'Add a GCash, Maya, or bank account as a payout method.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create the refund via PayMongo
      console.log(`📤 Initiating refund-based withdrawal...`);
      console.log(`Amount: ₱${netAmount}, Payment ID: ${paymentId}, Source: ${paymentSource}`);

      const refundResult = await createPayMongoRefund(
        paymentId,
        netAmount,
        `MusikaLokal wallet withdrawal for ${user.email} (${paymentSource})`
      );

      if (!refundResult.success) {
        console.error('❌ Refund-based withdrawal failed:', refundResult.error);
        return new Response(JSON.stringify({ 
          error: refundResult.error || 'Refund failed. Please try regular withdrawal method.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ PayMongo refund successful! Refund ID:', refundResult.refund_id);

      // ========================================
      // REFUND SUCCESS - UPDATE DATABASE
      // ========================================

      // 1. Deduct from wallet
      const { error: deductError } = await supabaseAdmin
        .from('wallets')
        .update({ 
          balance: wallet.balance - amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', wallet.id);

      if (deductError) throw deductError;

      // 2. Create wallet transaction (completed)
      const { data: transaction, error: txError } = await supabaseAdmin
        .from('wallet_transactions')
        .insert({
          wallet_id: wallet.id,
          amount: amount,
          type: 'withdrawal',
          description: `Withdrawal via refund (${paymentSource})`,
          is_credit: false,
          status: 'completed'
        })
        .select()
        .single();

      if (txError) throw txError;

      // 3. Create withdrawal request (completed)
      const { data: withdrawal, error: withdrawError } = await supabaseAdmin
        .from('withdrawal_requests')
        .insert({
          user_id: user.id,
          wallet_id: wallet.id,
          amount: amount,
          fee: fee,
          net_amount: netAmount,
          payout_type: 'refund',
          payout_account_name: user.email || 'User',
          payout_account_number: paymentId,
          status: 'completed',
          reference_number: refundResult.refund_id,
          notes: `Refund-based withdrawal from ${paymentSource} payment. No ID required.`,
          processed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (withdrawError) {
        console.error('❌ Failed to create withdrawal record:', withdrawError);
      }

      // 4. Update transaction with reference
      if (withdrawal) {
        await supabaseAdmin
          .from('wallet_transactions')
          .update({ reference_id: withdrawal.id })
          .eq('id', transaction.id);
      }

      // 5. Send notification
      await supabaseAdmin.from('notifications').insert({
        user_id: user.id,
        type: 'success',
        title: 'Withdrawal Processed! 💸',
        message: `₱${netAmount.toLocaleString()} has been refunded to your original payment method.`,
        meta: { withdrawal_id: withdrawal?.id, refund_id: refundResult.refund_id },
      });

      console.log('✅ Refund-based withdrawal completed successfully:', withdrawal?.id);

      return new Response(JSON.stringify({ 
        success: true, 
        withdrawal: withdrawal,
        reference: refundResult.refund_id,
        method: 'refund',
        message: `₱${netAmount.toLocaleString()} is being refunded to your original payment method!`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // GET ELIGIBLE REFUND PAYMENTS (for checking if refund withdrawal is available)
    // ============================================================
    if (action === 'get_refund_eligible_payments') {
      // Get subscription payments
      const { data: subPayments } = await supabaseAdmin
        .from('subscription_payments')
        .select('id, checkout_session_id, amount, paid_at')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .not('checkout_session_id', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(5);

      // Get booking payments  
      const { data: bookingPayments } = await supabaseAdmin
        .from('studio_bookings')
        .select('id, checkout_session_id, payment_amount, paid_at, studio:studios(name)')
        .eq('user_id', user.id)
        .eq('payment_status', 'paid')
        .not('checkout_session_id', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(5);

      const eligiblePayments: any[] = [];

      // Check each subscription payment
      if (subPayments) {
        for (const payment of subPayments) {
          if (payment.checkout_session_id) {
            const paymentInfo = await getPaymentFromCheckoutSession(payment.checkout_session_id);
            if (paymentInfo.payment_id) {
              eligiblePayments.push({
                type: 'subscription',
                amount: paymentInfo.amount,
                payment_method: paymentInfo.payment_method,
                paid_at: payment.paid_at,
              });
            }
          }
        }
      }

      // Check each booking payment
      if (bookingPayments) {
        for (const booking of bookingPayments) {
          if (booking.checkout_session_id) {
            const paymentInfo = await getPaymentFromCheckoutSession(booking.checkout_session_id);
            if (paymentInfo.payment_id) {
              eligiblePayments.push({
                type: 'booking',
                studio_name: (booking.studio as any)?.name,
                amount: paymentInfo.amount,
                payment_method: paymentInfo.payment_method,
                paid_at: booking.paid_at,
              });
            }
          }
        }
      }

      // Calculate max refundable amount
      const maxRefundable = eligiblePayments.length > 0 
        ? Math.max(...eligiblePayments.map(p => p.amount))
        : 0;

      return new Response(JSON.stringify({ 
        success: true, 
        has_eligible_payments: eligiblePayments.length > 0,
        max_refundable_amount: maxRefundable,
        eligible_payments: eligiblePayments,
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
    console.error('❌ Withdrawal error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
