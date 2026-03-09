/**
 * Wraps an MCP tool handler with consistent error handling.
 * Catches errors and returns them in the standard MCP error format
 * with `isError: true` so LLMs can distinguish errors from empty results.
 */
export function toolHandler<TArgs>(
  toolName: string,
  fn: (
    args: TArgs
  ) => Promise<{ content: Array<{ type: "text"; text: string }> }>
): (args: TArgs) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  return async (args: TArgs) => {
    try {
      return await fn(args);
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error in ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}
