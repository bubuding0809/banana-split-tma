import { getPreferenceValues } from "@raycast/api";
import { getTrpcClient, type BananaTrpcClient } from "../trpc";
import { serializeToolResult } from "./serialize";

export function formatToolError(toolName: string, error: unknown): string {
  let message = "An unknown error occurred.";
  if (error instanceof Error) {
    if ("code" in error && typeof (error as { code?: string }).code === "string") {
      message = `TRPCError: ${(error as { code: string }).code} - ${error.message}`;
    } else {
      message = error.message;
    }
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object" && "message" in error) {
    message = String((error as { message: unknown }).message);
  }

  return serializeToolResult({
    _toolError: true,
    tool: toolName,
    message: `Tool execution failed. Fix the input and retry, or explain to the user. Details: ${message}`,
  });
}

/**
 * Catches all tool-layer errors, including validation that happens before the
 * authenticated tRPC call is started.
 */
export async function withToolErrors<TInput>(
  toolName: string,
  _input: TInput,
  fn: () => Promise<string>,
): Promise<string> {
  try {
    return await fn();
  } catch (error) {
    return formatToolError(toolName, error);
  }
}

/**
 * Wraps Raycast AI tool handlers with auth guard, tRPC client, and consistent errors.
 * Returns a JSON string for the model (mirrors packages/agent withToolErrorHandling).
 */
export async function runTool<TInput>(
  toolName: string,
  _input: TInput,
  fn: (trpc: BananaTrpcClient) => Promise<unknown>,
): Promise<string> {
  return withToolErrors(toolName, _input, async () => {
    const { apiKey } = getPreferenceValues<{ apiKey?: string }>();
    if (!apiKey?.trim()) {
      throw new Error("API key is not configured. Set it in Banana Split extension preferences.");
    }

    const trpc = getTrpcClient();
    const result = await fn(trpc);
    return serializeToolResult(result);
  });
}
