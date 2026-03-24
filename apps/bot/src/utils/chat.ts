import type { Chat } from "grammy/types";

export const ChatUtils = {
  createChatContext(chatId: number, chatType: string): string {
    const chatContext = {
      chat_id: chatId,
      chat_type: chatType === "private" ? "p" : "g",
    };
    const jsonStr = JSON.stringify(chatContext);
    return Buffer.from(jsonStr, "utf-8").toString("base64");
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
