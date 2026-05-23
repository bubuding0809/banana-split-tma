import { serializeForJson } from "@bananasplitz/api-client";
import { ApiValidationError } from "@bananasplitz/api-ops";

/** Print success result as JSON to stdout. Exit 0. */
export function success(data: unknown): never {
  console.log(serializeForJson(data));
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
    if (err instanceof ApiValidationError) {
      const category =
        err.code === "missing_field" ? "missing_option" : "invalid_option";
      return error(category, err.message, command);
    }
    const message = err instanceof Error ? err.message : String(err);
    return error("api_error", message, command);
  }
}
