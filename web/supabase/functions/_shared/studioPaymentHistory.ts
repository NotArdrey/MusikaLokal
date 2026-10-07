export function getConfirmedProviderPayment(payment: any) {
  const attributes = payment?.attributes;
  const amount = Number(attributes?.amount);
  if (!payment?.id || attributes?.status !== 'paid' || attributes?.currency !== 'PHP'
    || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Payment has not been confirmed by PayMongo');
  }
  const paidAt = Number(attributes.paid_at);
  return {
    id: String(payment.id), amount: amount / 100,
    method: attributes.source?.type || 'unknown',
    paidAt: Number.isFinite(paidAt) && paidAt > 0 ? new Date(paidAt * 1000).toISOString() : null,
  };
}

export function mergeWalletPaymentHistory(walletTransactions: any[], events: any[], limit = 80) {
  const grouped = new Map<string, any>();
  for (const event of events) {
    const key = `${event.provider_reference}:${event.stage}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.amount = Math.round((existing.amount + Number(event.amount)) * 100) / 100;
      existing.booking_ids.push(event.booking_id);
      continue;
    }
    const refund = event.stage === 'refund';
    grouped.set(key, {
      id: `online:${event.id}`, type: refund ? 'refund' : 'payment',
      reference_id: event.booking_id, booking_ids: [event.booking_id],
      reference_type: refund ? 'refund' : event.stage === 'historical' ? 'booking_historical'
        : `booking_${event.stage === 'full' ? 'payment' : event.stage}`,
      amount: Number(event.amount), is_credit: refund, status: 'completed',
      funding_source: 'paymongo', affects_wallet_balance: false,
      is_historical: event.is_historical, payment_method: event.payment_method,
      created_at: event.occurred_at, recorded_at: event.recorded_at,
    });
  }
  return [...walletTransactions, ...grouped.values()].sort((a, b) => {
    const aTime = Date.parse(a.created_at || '') || 0;
    const bTime = Date.parse(b.created_at || '') || 0;
    return bTime - aTime || String(a.id).localeCompare(String(b.id));
  }).slice(0, limit);
}
