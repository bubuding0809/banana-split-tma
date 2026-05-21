/** Shared display formatting for the BananaSplitz extension. */

export const CHAT_TYPE_LABEL: Record<string, string> = {
  private: "Private",
  group: "Group",
  supergroup: "Supergroup",
  channel: "Channel",
  sender: "Sender",
};

/** Absolute amount with thousands separators and 2 decimals, e.g. "1,234.50". */
export function formatAmount(value: number): string {
  return Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A signed, currency-suffixed amount, e.g. "+42.50 SGD". */
export function formatNet(net: number, currency: string): string {
  return `${net > 0 ? "+" : "-"}${formatAmount(net)} ${currency}`;
}

/** A short, locale-aware date, e.g. "21 May 2026". */
export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
