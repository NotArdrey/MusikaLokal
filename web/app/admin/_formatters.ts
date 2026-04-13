export const formatDetailLabel = (rawKey: string) => {
  const withSpaces = rawKey.replace(/_/g, ' ').trim();
  if (!withSpaces) return 'Field';

  return withSpaces
    .split(' ')
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
};

export const formatDetailValue = (value: unknown) => {
  if (value === null || value === undefined) return '-';

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'string') {
    // Try to format ISO date strings
    const isIsoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
    if (isIsoDate) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
      }
    }
    return value.trim() || '-';
  }

  if (typeof value === 'object') {
    // Make arrays readable if they are simple strings
    if (Array.isArray(value)) {
      if (value.length === 0) return 'None';
      if (value.every(v => typeof v === 'string')) {
        return value.join(', ');
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  const text = String(value).trim();
  return text || '-';
};
