/** BigInt-safe JSON serialization (mirrors apps/cli/src/output.ts replacer). */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Serialize tool results as pretty-printed JSON for the Raycast AI model. */
export function serializeToolResult(result: unknown): string {
  return JSON.stringify(result, replacer, 2);
}
