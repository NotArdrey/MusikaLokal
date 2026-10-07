const CATEGORY_LABELS: Record<string, string> = {
  booking: 'Booking', booking_balance: 'Balance', booking_downpayment: 'Downpayment',
  booking_payment: 'Full payment', booking_historical: 'Historical payment total',
  credit: 'Credit', debit: 'Debit', deposit: 'Deposit', earning: 'Earning', refund: 'Refund', withdrawal: 'Withdrawal',
};

const formatText = (value: unknown) => String(value || '').trim().replace(/_/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

export const getTransactionCategory = (tx: any) => String(tx?.reference_type || tx?.type || 'other').trim().toLowerCase();
export const getTransactionCategoryLabel = (tx: any) => CATEGORY_LABELS[getTransactionCategory(tx)] || formatText(getTransactionCategory(tx));
export const getTransactionTitle = (tx: any) => formatText(tx?.type) || 'Wallet Transaction';

export function filterWalletTransactions(transactions: any[], filter: string) {
  if (filter === 'all') return transactions;
  if (filter === 'payments') return transactions.filter(tx => tx.type === 'payment');
  return transactions.filter(tx => getTransactionCategory(tx) === filter);
}

export function getExternalPaymentLabel(tx: any) {
  if (tx.affects_wallet_balance !== false) return null;
  const historical = tx.is_historical ? 'Historical record · ' : '';
  const method = tx.payment_method === 'qrph' ? 'QR Ph' : formatText(tx.payment_method || 'PayMongo');
  return `${historical}${tx.type === 'refund' ? 'Refunded' : 'Paid'} via ${method}`;
}
