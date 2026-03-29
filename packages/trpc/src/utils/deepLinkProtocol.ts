import { encodeBase62, decodeBase62 } from "./base62.js";

export interface DecodedDeepLink {
  chat_id: string;
  chat_type: string;
  entity_type?: string;
  entity_id?: string;
}

export function encodeV1DeepLink(
  chatId: bigint,
  chatType: string,
  entityType?: "s" | "e" | "p",
  entityId?: string
): string {
  // Use absolute value for chat ID to avoid negative sign in base62
  const absChatId = chatId < 0n ? -chatId : chatId;
  const chatIdStr = (chatId < 0n ? "-" : "") + encodeBase62(absChatId);

  let payload = `v1_${chatType}_${chatIdStr}`;

  if (entityType && entityId) {
    const hexUuid = entityId.replace(/-/g, "");
    const uuidBigInt = BigInt("0x" + hexUuid);
    const uuidStr = encodeBase62(uuidBigInt);
    payload += `_${entityType}_${uuidStr}`;
  }

  return payload;
}

export function decodeV1DeepLink(payload: string): DecodedDeepLink | null {
  if (!payload.startsWith("v1_")) return null;

  try {
    const segments = payload.split("_");
    if (segments.length !== 3 && segments.length !== 5) return null;
    const [_version, chatType, chatIdBase62, entityType, entityIdBase62] =
      segments as [
        string,
        string,
        string,
        string | undefined,
        string | undefined,
      ];

    // Decode chat ID
    const isNegative = chatIdBase62.startsWith("-");
    const actualBase62 = isNegative ? chatIdBase62.slice(1) : chatIdBase62;
    let decodedChatId = decodeBase62(actualBase62);
    if (isNegative) {
      decodedChatId = -decodedChatId;
    }

    const result: DecodedDeepLink = {
      chat_id: decodedChatId.toString(),
      chat_type: chatType,
    };

    if (entityType && entityIdBase62) {
      result.entity_type = entityType;

      const uuidBigInt = decodeBase62(entityIdBase62);

      // Convert back to hex and pad to 32 chars
      let hexUuid = uuidBigInt.toString(16);
      hexUuid = hexUuid.padStart(32, "0");

      // Re-insert hyphens
      result.entity_id = `${hexUuid.slice(0, 8)}-${hexUuid.slice(8, 12)}-${hexUuid.slice(12, 16)}-${hexUuid.slice(16, 20)}-${hexUuid.slice(20)}`;
    }

    return result;
  } catch (error) {
    return null;
  }
}
