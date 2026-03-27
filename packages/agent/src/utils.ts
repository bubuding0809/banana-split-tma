import { serializeToolResult } from "./serialize.js";

export function withToolErrorHandling<TData, TContext, TResult>(
  fn: (data: TData, context: TContext) => Promise<TResult>
): (data: TData, context: TContext) => Promise<any> {
  return async (data, context) => {
    try {
      return await fn(data, context);
    } catch (error) {
      console.error("[Tool Error]", error);

      let errorMessage = "An unknown error occurred.";
      if (error instanceof Error) {
        if ("code" in error && typeof (error as any).code === "string") {
          errorMessage = `TRPCError: ${(error as any).code} - ${error.message}`;
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      } else if (typeof error === "string") {
        errorMessage = `Error: ${error}`;
      } else if (error && typeof error === "object" && "message" in error) {
        errorMessage = `Error: ${(error as any).message}`;
      }

      // Serialize an error object so the agent can parse and understand it gracefully
      return serializeToolResult({
        _toolError: true,
        message: `Tool execution failed. Please fix the input and try again or inform the user. Details: ${errorMessage}`,
      });
    }
  };
}
