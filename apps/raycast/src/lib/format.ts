/** Shared display formatting for the Banana Split Raycast extension. */

/** Absolute amount with thousands separators and 2 decimals, e.g. "1,234.50". */
export function formatAmount(value: number): string {
  return Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A short, locale-aware date, e.g. "21 May 2026". */
export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Day + month only, e.g. "20 May". */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * A coarse "time from now" label for short countdowns, e.g. "~3h", "~45m",
 * "~2d". Input is a duration in milliseconds; non-positive input returns "now".
 */
export function formatRelativeShort(ms: number): string {
  if (ms <= 0) return "now";
  const minutes = ms / 60_000;
  if (minutes < 1) return "~1m";
  if (minutes < 60) return `~${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `~${Math.round(hours)}h`;
  return `~${Math.round(hours / 24)}d`;
}
