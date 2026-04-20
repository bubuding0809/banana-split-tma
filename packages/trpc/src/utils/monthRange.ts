const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface MonthRange {
  start: Date;
  endExclusive: Date;
}

/**
 * Parse a `YYYY-MM` string into a UTC half-open interval `[start, endExclusive)`.
 * Throws if the input is malformed.
 */
export function parseMonthRange(input: string): MonthRange {
  const match = MONTH_RE.exec(input);
  if (!match) {
    throw new Error(`Invalid month: ${input}. Expected YYYY-MM.`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1; // JS months are 0-indexed
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const endExclusive = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, endExclusive };
}
