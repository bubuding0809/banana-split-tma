import { encodeV1DeepLink } from "./deepLinkProtocol.js";

/**
 * Encode a numeric Telegram user ID as a UUID-shaped string so it can
 * piggy-back on the existing v1 deep-link protocol's UUID encoder. The
 * encoder treats `entity_id` as a UUID, decodes it hex → bigint, and
 * round-trips it back to a UUID on the client. We reverse that on the
 * TMA side via `uuidToNumericId`.
 */
export function numericIdToUuid(id: bigint | number): string {
  const bi = typeof id === "bigint" ? id : BigInt(id);
  if (bi < 0n) throw new Error("numericIdToUuid: negative IDs not supported");
  const hex = bi.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidToNumericId(uuid: string): bigint {
  return BigInt("0x" + uuid.replace(/-/g, ""));
}

/**
 * Build the start_param payload for a cross-group counterparty deep link.
 * Drops the recipient into the personal-chat Groups tab with the
 * CounterpartyBalanceSheet auto-opened for the given counterparty.
 *
 * `chatId` is the recipient's own Telegram user id (their personal chat).
 * `counterpartyUserId` is the other party whose balance sheet should open.
 */
export function buildCounterpartyDeepLinkPayload(
  recipientUserId: bigint | number,
  counterpartyUserId: bigint | number
): string {
  const rcp =
    typeof recipientUserId === "bigint"
      ? recipientUserId
      : BigInt(recipientUserId);
  return encodeV1DeepLink(rcp, "p", "c", numericIdToUuid(counterpartyUserId));
}

/**
 * Build the full t.me URL that opens the bot's mini-app with the given
 * start_param. `botUsername` is the bot's @handle (without the `@`).
 */
export function buildMiniAppUrl(
  botUsername: string,
  startParam: string
): string {
  return `https://t.me/${botUsername}?startapp=${startParam}`;
}
