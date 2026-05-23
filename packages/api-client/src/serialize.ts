function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** BigInt-safe JSON serialization for CLI stdout and Raycast tool results. */
export function serializeForJson(value: unknown, pretty = true): string {
  return JSON.stringify(value, replacer, pretty ? 2 : undefined);
}
