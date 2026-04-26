const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g;

/**
 * Redact bot tokens from error messages before logging. Defense in depth
 * against future Node/Undici versions or HTTP intermediaries that might
 * include token-bearing URLs (`https://api.telegram.org/file/bot<TOKEN>/...`)
 * in error messages.
 *
 * Mirrors telegraf's internal redactToken pattern for the one HTTP call
 * (fetch of the file bytes) that doesn't pass through telegraf.
 *
 * Note: this redacts the surface error string only (err.message for Error
 * instances, String(err) otherwise). It does not recursively walk err.cause —
 * we never serialize err.cause into log payloads.
 */
export function redactBotToken(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(TOKEN_RE, "bot[REDACTED]");
}
