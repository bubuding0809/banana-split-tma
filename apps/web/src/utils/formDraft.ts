/**
 * sessionStorage-backed draft cache for in-progress forms that can navigate
 * away mid-edit (e.g. Add Expense → Organize picker → back) and need their
 * local state restored on return.
 *
 * Scoped per-session: clears when the TMA closes. Keyed by the caller —
 * typically `form-kind:chatId` or `form-kind:entityId` — so different
 * entities don't collide.
 */

const PREFIX = "tma:form-draft:";

export function saveFormDraft(key: string, values: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(values));
  } catch {
    // storage quota / disabled storage — non-critical, swallow.
  }
}

export function readFormDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // swallow
  }
}
