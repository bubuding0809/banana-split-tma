import { vi } from "vitest";

function mapValidationError(err: unknown): {
  code: "missing_option" | "invalid_option";
  message: string;
} | null {
  if (
    err instanceof Error &&
    err.name === "ApiValidationError" &&
    "code" in err
  ) {
    const code =
      (err as { code: string }).code === "missing_field"
        ? "missing_option"
        : "invalid_option";
    return { code, message: err.message };
  }
  return null;
}

export function createOutputMocks() {
  return {
    success: vi.fn((data: unknown) => data),
    error: vi.fn((code: string, message: string, command?: string) => ({
      code,
      message,
      command,
    })),
    run: vi.fn(async (cmd: string, fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch (err: unknown) {
        const validation = mapValidationError(err);
        if (validation) {
          return { ...validation, command: cmd };
        }
        const message = err instanceof Error ? err.message : String(err);
        return { code: "api_error", message };
      }
    }),
  };
}

export function createResolveChatIdMock() {
  return vi.fn(async (_trpc: unknown, chatId?: string) => {
    if (chatId) return Number(chatId);
    return 12345;
  });
}
