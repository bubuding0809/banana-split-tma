export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function requireField<T>(value: T | undefined, name: string): NonNullable<T> {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${name} is required`);
  }
  return value as NonNullable<T>;
}

export function parseNumber(value: string | number, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} must be a valid number`);
  return n;
}

export function parsePositiveNumber(value: string | number, field: string): number {
  const n = parseNumber(value, field);
  if (n <= 0) throw new Error(`${field} must be a positive number`);
  return n;
}

export function parseCommaSeparatedNumbers(value: string, field: string): number[] {
  const ids = value.split(",").map((s) => Number(s.trim()));
  if (ids.some(Number.isNaN)) {
    throw new Error(`${field} must be comma-separated numbers`);
  }
  return ids;
}

export function parseJsonArray<T>(value: string, field: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed as T[];
  } catch {
    throw new Error(`${field} must be a valid JSON array`);
  }
}

export function parseBooleanString(value: string, field: string): boolean {
  const v = value.toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`${field} must be true or false`);
}
