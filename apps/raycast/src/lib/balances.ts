/** Shared cross-group balance types — the People command's data model. */

/** One (chat, currency) balance line with a counterparty. */
export type CounterpartyGroup = {
  chatId: number;
  chatTitle: string;
  currency: string;
  /** >0 = the counterparty owes you in this chat+currency, <0 = you owe them. */
  nativeNet: number;
  /** nativeNet converted to the caller's base currency. */
  baseNet: number;
};

/** A person the caller has an outstanding balance with, across all chats. */
export type Counterparty = {
  userId: number;
  firstName: string;
  lastName: string | null;
  hasStartedBot: boolean;
  /** Epoch ms when the next nudge is allowed, or null if not rate-limited. */
  nudgeCooldownUntil: number | null;
  /** >0 = they owe you overall, <0 = you owe them. In base currency. */
  totalBaseNet: number;
  groups: CounterpartyGroup[];
};

/** Full display name, trimmed. */
export function counterpartyName(cp: Pick<Counterparty, "firstName" | "lastName">): string {
  return [cp.firstName, cp.lastName].filter(Boolean).join(" ") || "Unknown";
}
