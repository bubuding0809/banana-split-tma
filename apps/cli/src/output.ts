/** Custom replacer: BigInt → string for JSON serialization */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Print success result as JSON to stdout. Exit 0. */
export function success(data: unknown): never {
  console.log(JSON.stringify(data, replacer, 2));
  process.exit(0);
}

/** Print error as JSON to stderr. Exit 1. */
export function error(
  category:
    | "missing_option"
    | "invalid_option"
    | "auth_error"
    | "api_error"
    | "unknown_command"
    | "unexpected_error",
  message: string,
  command?: string
): never {
  const obj: Record<string, string> = { error: category, message };
  if (command) obj.command = command;
  console.error(JSON.stringify(obj, null, 2));
  process.exit(1);
}

/** Wrap a command handler to catch tRPC/network errors and format them. */
export async function run(
  command: string,
  fn: () => Promise<unknown>
): Promise<never> {
  try {
    const result = await fn();
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("api_error", message, command);
  }
}
