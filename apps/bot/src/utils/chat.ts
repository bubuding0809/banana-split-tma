import { Chat } from "grammy/types";
import { encodeV1DeepLink } from "@dko/trpc/src/utils/deepLinkProtocol";

export const ChatUtils = {
  createChatContext(
    chatId: bigint | number,
    type: "private" | "group" | "supergroup" | "channel"
  ): string {
    // Map bot chat types to the 1-character format used in our deep link protocol
    const mappedType = type === "private" ? "p" : "g";
    const bigIntChatId = typeof chatId === "bigint" ? chatId : BigInt(chatId);
    return encodeV1DeepLink(bigIntChatId, mappedType);
  },

  createMiniAppUrl(
    deeplinkTemplate: string,
    botUsername: string,
    command: string,
    mode: string = "compact"
  ): string {
    return deeplinkTemplate
      .replace("{botusername}", botUsername)
      .replace("{mode}", mode)
      .replace("{command}", command);
  },

  isForumChat(chat: Chat): boolean {
    return "is_forum" in chat && chat.is_forum === true;
  },
};
