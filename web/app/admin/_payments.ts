import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

export type AdminPaymentStatusFilter =
  | 'all'
  | 'paid'
  | 'partial'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'refund_pending';

export type AdminPaymentDateRange = '7d' | '30d' | 'all';

export interface AdminPaymentTransaction {
  id: string;
  booking_id: string;
  action: string;
  event_at: string | null;
  booking_status: string;
  payment_status: string;
  payment_type: string | null;
  payment_method: string | null;
  amount: number;
  refund_amount: number;
  net_amount: number;
  remaining_balance: number;
  provider_earning_amount: number;
  wallet_transaction_count: number;
  customer_name: string | null;
  customer_email: string | null;
  studio_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  booking_date: string | null;
  start_time: string | null;
  end_time: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  refund_id: string | null;
  cancellation_reason: string | null;
  reference: string | null;
}

export interface AdminPaymentTotals {
  count: number;
  grossAmount: number;
  refundedAmount: number;
  netAmount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  failedCount: number;
  cancelledCount: number;
  refundedCount: number;
}

export interface AdminPaymentTransactionResult {
  transactions: AdminPaymentTransaction[];
  totals: AdminPaymentTotals;
  count: number;
  hasMore: boolean;
}

export const PAYMENT_STATUS_FILTERS: { key: AdminPaymentStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'partial', label: 'Partial' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'refund_pending', label: 'Refund Pending' },
];

const defaultPaymentTotals: AdminPaymentTotals = {
  count: 0,
  grossAmount: 0,
  refundedAmount: 0,
  netAmount: 0,
  paidCount: 0,
  partialCount: 0,
  pendingCount: 0,
  failedCount: 0,
  cancelledCount: 0,
  refundedCount: 0,
};

const toNumber = (value: unknown) => {
  const nextValue = Number(value || 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

const normalizeText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

export const normalizePaymentActionLabel = (action?: string | null) => {
  const normalized = String(action || '').trim().toLowerCase();

  if (normalized === 'payment_paid') return 'Payment Paid';
  if (normalized === 'payment_partial') return 'Partial Payment';
  if (normalized === 'payment_pending') return 'Payment Pending';
  if (normalized === 'payment_failed') return 'Payment Failed';
  if (normalized === 'payment_cancelled') return 'Payment Cancelled';
  if (normalized === 'payment_refunded') return 'Payment Refunded';
  if (normalized === 'payment_refund_pending') return 'Refund Pending';

  return normalized
    ? normalized.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Payment';
};

export const getPaymentStatusColor = (transaction: Pick<AdminPaymentTransaction, 'action' | 'payment_status' | 'booking_status'>) => {
  const action = String(transaction.action || '').toLowerCase();
  const paymentStatus = String(transaction.payment_status || '').toLowerCase();
  const bookingStatus = String(transaction.booking_status || '').toLowerCase();

  if (action.includes('refund') || paymentStatus.includes('refund')) return '#0ea5e9';
  if (action.includes('cancel') || bookingStatus === 'cancelled') return '#ef4444';
  if (action.includes('failed') || paymentStatus === 'failed') return '#ef4444';
  if (action.includes('pending') || paymentStatus === 'pending') return '#f59e0b';
  if (paymentStatus === 'paid' || paymentStatus === 'partial') return '#10b981';

  return '#64748b';
};

const normalizePaymentTransaction = (item: any): AdminPaymentTransaction => ({
  id: String(item?.id || item?.booking_id || ''),
  booking_id: String(item?.booking_id || item?.id || ''),
  action: String(item?.action || 'payment_unpaid'),
  event_at: normalizeText(item?.event_at),
  booking_status: String(item?.booking_status || ''),
  payment_status: String(item?.payment_status || ''),
  payment_type: normalizeText(item?.payment_type),
  payment_method: normalizeText(item?.payment_method),
  amount: toNumber(item?.amount),
  refund_amount: toNumber(item?.refund_amount),
  net_amount: toNumber(item?.net_amount),
  remaining_balance: toNumber(item?.remaining_balance),
  provider_earning_amount: toNumber(item?.provider_earning_amount),
  wallet_transaction_count: Math.max(0, Math.round(toNumber(item?.wallet_transaction_count))),
  customer_name: normalizeText(item?.customer_name),
  customer_email: normalizeText(item?.customer_email),
  studio_name: normalizeText(item?.studio_name),
  owner_name: normalizeText(item?.owner_name),
  owner_email: normalizeText(item?.owner_email),
  booking_date: normalizeText(item?.booking_date),
  start_time: normalizeText(item?.start_time),
  end_time: normalizeText(item?.end_time),
  paid_at: normalizeText(item?.paid_at),
  refunded_at: normalizeText(item?.refunded_at),
  created_at: normalizeText(item?.created_at),
  updated_at: normalizeText(item?.updated_at),
  checkout_session_id: normalizeText(item?.checkout_session_id),
  payment_intent_id: normalizeText(item?.payment_intent_id),
  refund_id: normalizeText(item?.refund_id),
  cancellation_reason: normalizeText(item?.cancellation_reason),
  reference: normalizeText(item?.reference),
});

const normalizePaymentTotals = (payload: any): AdminPaymentTotals => ({
  count: Math.max(0, Math.round(toNumber(payload?.count))),
  grossAmount: toNumber(payload?.grossAmount),
  refundedAmount: toNumber(payload?.refundedAmount),
  netAmount: toNumber(payload?.netAmount),
  paidCount: Math.max(0, Math.round(toNumber(payload?.paidCount))),
  partialCount: Math.max(0, Math.round(toNumber(payload?.partialCount))),
  pendingCount: Math.max(0, Math.round(toNumber(payload?.pendingCount))),
  failedCount: Math.max(0, Math.round(toNumber(payload?.failedCount))),
  cancelledCount: Math.max(0, Math.round(toNumber(payload?.cancelledCount))),
  refundedCount: Math.max(0, Math.round(toNumber(payload?.refundedCount))),
});

export const fetchAdminPaymentTransactions = async (filters?: {
  status?: AdminPaymentStatusFilter;
  searchQuery?: string;
  dateRange?: AdminPaymentDateRange;
  limit?: number;
  offset?: number;
}): Promise<AdminPaymentTransactionResult> => {
  const { data, error } = await supabase.functions.invoke<any>('permit-management', {
    body: {
      action: 'admin_fetch_payment_transactions',
      status: filters?.status || 'all',
      searchQuery: String(filters?.searchQuery || '').trim() || null,
      dateRange: filters?.dateRange || '30d',
      limit: Math.max(1, Math.min(1000, Number(filters?.limit || 50))),
      offset: Math.max(0, Number(filters?.offset || 0)),
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));

  return {
    transactions: Array.isArray(data?.transactions)
      ? data.transactions.map(normalizePaymentTransaction).filter((item: AdminPaymentTransaction) => item.booking_id)
      : [],
    totals: data?.totals ? normalizePaymentTotals(data.totals) : defaultPaymentTotals,
    count: Math.max(0, Math.round(toNumber(data?.count))),
    hasMore: Boolean(data?.hasMore),
  };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toExcelSafeText = (value: unknown) => {
  const rawText = value === null || value === undefined ? '' : String(value);
  const trimmedStart = rawText.trimStart();

  if (/^[=+\-@]/.test(trimmedStart)) {
    return `'${rawText}`;
  }

  return rawText;
};

const formatExcelTimestamp = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-PH');
};

const buildPaymentExcelRows = (transactions: AdminPaymentTransaction[]) => {
  return transactions.map((transaction) => ({
    'Event Date': formatExcelTimestamp(transaction.event_at),
    'Action': normalizePaymentActionLabel(transaction.action),
    'Payment Status': transaction.payment_status,
    'Booking Status': transaction.booking_status,
    'Customer': transaction.customer_name || transaction.customer_email || '',
    'Customer Email': transaction.customer_email || '',
    'Studio': transaction.studio_name || '',
    'Studio Owner': transaction.owner_name || transaction.owner_email || '',
    'Owner Email': transaction.owner_email || '',
    'Amount': transaction.amount.toFixed(2),
    'Refund Amount': transaction.refund_amount.toFixed(2),
    'Net Amount': transaction.net_amount.toFixed(2),
    'Remaining Balance': transaction.remaining_balance.toFixed(2),
    'Provider Earning': transaction.provider_earning_amount.toFixed(2),
    'Payment Type': transaction.payment_type || '',
    'Payment Method': transaction.payment_method || '',
    'Booking Date': transaction.booking_date || '',
    'Start Time': transaction.start_time || '',
    'End Time': transaction.end_time || '',
    'Paid At': formatExcelTimestamp(transaction.paid_at),
    'Refunded At': formatExcelTimestamp(transaction.refunded_at),
    'Booking ID': transaction.booking_id,
    'Checkout Session ID': transaction.checkout_session_id || '',
    'Payment Intent ID': transaction.payment_intent_id || '',
    'Refund ID': transaction.refund_id || '',
    'Reference': transaction.reference || '',
    'Wallet Transaction Count': String(transaction.wallet_transaction_count),
    'Cancellation Reason': transaction.cancellation_reason || '',
  }));
};

export const downloadPaymentTransactionsExcel = (
  transactions: AdminPaymentTransaction[],
  options?: {
    dateRangeLabel?: string;
    statusLabel?: string;
  },
) => {
  if (Platform.OS !== 'web') return false;

  const globalAny = globalThis as any;
  const documentRef = globalAny.document;
  const urlApi = globalAny.URL || globalAny.webkitURL;

  if (!documentRef || !globalAny.Blob || !urlApi?.createObjectURL) {
    return false;
  }

  const rows = buildPaymentExcelRows(transactions);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const subtitle = [
    options?.dateRangeLabel,
    options?.statusLabel && options.statusLabel !== 'All' ? options.statusLabel : null,
  ].filter(Boolean).join(' | ');

  const headerHtml = headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join('');
  const rowsHtml = rows
    .map((row) => (
      `<tr>${headers.map((header) => (
        `<td style="mso-number-format:'\\@';">${escapeHtml(toExcelSafeText((row as Record<string, string>)[header]))}</td>`
      )).join('')}</tr>`
    ))
    .join('');

  const workbookHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-family: Arial, sans-serif; font-size: 12px; }
    th { background: #e2e8f0; font-weight: 700; }
    .title { font-size: 18px; font-weight: 700; }
    .subtitle { font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <table>
    <tr><td class="title" colspan="${Math.max(headers.length, 1)}">MusikaLokal Payment Transactions</td></tr>
    ${subtitle ? `<tr><td class="subtitle" colspan="${Math.max(headers.length, 1)}">${escapeHtml(subtitle)}</td></tr>` : ''}
    <tr>${headerHtml}</tr>
    ${rowsHtml}
  </table>
</body>
</html>`;

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `musikalokal-payment-transactions-${today}.xls`;
  const blob = new globalAny.Blob([workbookHtml], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  documentRef.body.appendChild(anchor);
  anchor.click();
  documentRef.body.removeChild(anchor);

  if (urlApi.revokeObjectURL) {
    urlApi.revokeObjectURL(url);
  }

  return true;
};
