import { createTRPCRouter } from "../../trpc.js";
import getChat from "./getChat.js";
import getUserProfilePhotoUrl from "./getUserProfilePhotoUrl.js";
import getChatMember from "./getChatMember.js";
import sendMessage from "./sendMessage.js";

export const telegramRouter = createTRPCRouter({
  getChat,
  getUserProfilePhotoUrl,
  getChatMember,
  sendMessage,
});
