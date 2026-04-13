// src/utils/helpers.js

/**
 * Format a number as currency (USD by default).
 */
export function formatCurrency(value, currency = 'USD') {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

/**
 * Format an ISO date string to a human-readable date.
 */
export function formatDate(dateStr, options = {}) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    ...options,
  });
}

/**
 * Format an ISO datetime string to date + time.
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Get initials from a full name.
 */
export function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

/**
 * Capitalise first letter of each word.
 */
export function titleCase(str = '') {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Extract a user-friendly error message from an Axios error.
 */
export function extractError(err, fallback = 'Something went wrong') {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message        ||
    err?.message                         ||
    fallback
  );
}

/**
 * Convert an array to a map keyed by a field (e.g. "id").
 */
export function toMap(arr = [], key = 'id') {
  return arr.reduce((acc, item) => {
    acc[item[key]] = item;
    return acc;
  }, {});
}

/**
 * Compute percentage safely.
 */
export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
