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

const downloadWebBlob = (blob: Blob, fileName: string) => {
  const globalAny = globalThis as any;
  const documentRef = globalAny.document;
  const urlApi = globalAny.URL || globalAny.webkitURL;

  if (!documentRef || !urlApi?.createObjectURL) {
    return false;
  }

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

export const downloadPaymentTransactionsExcel = (
  transactions: AdminPaymentTransaction[],
  options?: {
    dateRangeLabel?: string;
    statusLabel?: string;
  },
) => {
  if (Platform.OS !== 'web') return false;

  const globalAny = globalThis as any;

  if (!globalAny.Blob) {
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
  return downloadWebBlob(blob, fileName);
};

const PDF_PAGE_WIDTH = 842;
const PDF_PAGE_HEIGHT = 595;
const PDF_MARGIN = 36;

const pdfColumns: {
  header: string;
  key: string;
  width: number;
  align?: 'left' | 'right';
}[] = [
  { header: 'Event', key: 'Event Date', width: 88 },
  { header: 'Action', key: 'Action', width: 82 },
  { header: 'Customer', key: 'Customer', width: 120 },
  { header: 'Studio', key: 'Studio', width: 110 },
  { header: 'Amount', key: 'Amount', width: 65, align: 'right' },
  { header: 'Refund', key: 'Refund Amount', width: 65, align: 'right' },
  { header: 'Net', key: 'Net Amount', width: 65, align: 'right' },
  { header: 'Booking ID', key: 'Booking ID', width: 175 },
];

const cleanPdfText = (value: unknown) => {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\x20-\x7E]/g, '?');
};

const escapePdfText = (value: unknown) => (
  cleanPdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
);

const formatPdfNumber = (value: number) => {
  const fixed = value.toFixed(2);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
};

const estimatePdfTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.48;

const wrapPdfText = (value: unknown, maxWidth: number, fontSize: number) => {
  const text = cleanPdfText(value);
  if (!text) return [''];

  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * 0.48)));
  const lines: string[] = [];
  let currentLine = '';

  text.split(' ').forEach((word) => {
    const chunks = word.length <= maxChars
      ? [word]
      : word.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [word];

    chunks.forEach((chunk) => {
      const candidate = currentLine ? `${currentLine} ${chunk}` : chunk;
      if (candidate.length <= maxChars) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = chunk;
      }
    });
  });

  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 4);
};

const pdfTextCommand = (
  text: unknown,
  x: number,
  y: number,
  fontSize: number,
  fontName = 'F1',
) => `0 0 0 rg BT /${fontName} ${formatPdfNumber(fontSize)} Tf ${formatPdfNumber(x)} ${formatPdfNumber(PDF_PAGE_HEIGHT - y)} Td (${escapePdfText(text)}) Tj ET\n`;

const pdfRectCommand = (
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor?: string,
) => {
  const rect = `${formatPdfNumber(x)} ${formatPdfNumber(PDF_PAGE_HEIGHT - y - height)} ${formatPdfNumber(width)} ${formatPdfNumber(height)} re`;
  return fillColor ? `${fillColor} rg ${rect} f\n` : `${rect} S\n`;
};

const buildPdfBytes = (pages: string[]) => {
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontRegularId = 3;
  const fontBoldId = 4;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  pages.forEach((content, index) => {
    const contentId = 5 + index * 2;
    const pageId = contentId + 1;
    pageIds.push(pageId);
    objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
  });

  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;

  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) {
    bytes[index] = pdf.charCodeAt(index) & 0xff;
  }
  return bytes;
};

const buildPaymentTransactionsPdf = (
  transactions: AdminPaymentTransaction[],
  options?: {
    dateRangeLabel?: string;
    statusLabel?: string;
  },
) => {
  const rows = buildPaymentExcelRows(transactions);
  const subtitle = [
    options?.dateRangeLabel,
    options?.statusLabel && options.statusLabel !== 'All' ? options.statusLabel : null,
    `${rows.length} transaction${rows.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' | ');
  const generatedAt = `Generated ${formatExcelTimestamp(new Date().toISOString())}`;
  const pages: string[] = [];
  let page = '';
  let pageNumber = 0;
  let y = PDF_MARGIN;

  const addPage = () => {
    pageNumber += 1;
    page = '';
    y = PDF_MARGIN;
    page += pdfTextCommand('MusikaLokal Payment Transactions', PDF_MARGIN, y, 16, 'F2');
    y += 18;
    page += pdfTextCommand(subtitle, PDF_MARGIN, y, 9, 'F1');
    page += pdfTextCommand(generatedAt, PDF_PAGE_WIDTH - PDF_MARGIN - 145, y, 9, 'F1');
    y += 22;
  };

  const closePage = () => {
    page += pdfTextCommand(`Page ${pageNumber}`, PDF_PAGE_WIDTH - PDF_MARGIN - 42, PDF_PAGE_HEIGHT - 22, 8, 'F1');
    pages.push(page);
  };

  const drawHeader = () => {
    let x = PDF_MARGIN;
    page += pdfRectCommand(PDF_MARGIN, y - 3, PDF_PAGE_WIDTH - PDF_MARGIN * 2, 18, '0.90 0.94 1');
    page += '0.72 0.78 0.86 RG 0.5 w\n';

    pdfColumns.forEach((column) => {
      page += pdfTextCommand(column.header, x + 4, y + 8, 8, 'F2');
      page += pdfRectCommand(x, y - 3, column.width, 18);
      x += column.width;
    });

    y += 18;
  };

  addPage();
  drawHeader();

  rows.forEach((row) => {
    const wrappedCells = pdfColumns.map((column) => (
      wrapPdfText((row as Record<string, string>)[column.key], column.width - 8, 7)
    ));
    const rowHeight = Math.max(20, Math.max(...wrappedCells.map((lines) => lines.length)) * 9 + 8);

    if (y + rowHeight > PDF_PAGE_HEIGHT - PDF_MARGIN) {
      closePage();
      addPage();
      drawHeader();
    }

    let x = PDF_MARGIN;
    page += '0.80 0.84 0.90 RG 0.35 w\n';

    pdfColumns.forEach((column, columnIndex) => {
      const lines = wrappedCells[columnIndex];
      page += pdfRectCommand(x, y, column.width, rowHeight);

      lines.forEach((line, lineIndex) => {
        const textX = column.align === 'right'
          ? x + column.width - 4 - estimatePdfTextWidth(line, 7)
          : x + 4;
        page += pdfTextCommand(line, Math.max(x + 4, textX), y + 12 + lineIndex * 9, 7, 'F1');
      });

      x += column.width;
    });

    y += rowHeight;
  });

  if (rows.length === 0) {
    page += pdfTextCommand('No payment transactions match this filter.', PDF_MARGIN, y + 14, 9, 'F1');
  }

  closePage();
  return buildPdfBytes(pages);
};

export const downloadPaymentTransactionsPdf = (
  transactions: AdminPaymentTransaction[],
  options?: {
    dateRangeLabel?: string;
    statusLabel?: string;
  },
) => {
  if (Platform.OS !== 'web') return false;

  const globalAny = globalThis as any;

  if (!globalAny.Blob || typeof globalAny.Uint8Array === 'undefined') {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `musikalokal-payment-transactions-${today}.pdf`;
  const blob = new globalAny.Blob([buildPaymentTransactionsPdf(transactions, options)], {
    type: 'application/pdf',
  });

  return downloadWebBlob(blob, fileName);
};
