import listByChat from "./listByChat.js";
import createChatCategory from "./createChatCategory.js";
import updateChatCategory from "./updateChatCategory.js";
import deleteChatCategory from "./deleteChatCategory.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
  update: updateChatCategory,
  delete: deleteChatCategory,
});
