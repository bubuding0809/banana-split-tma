import listByChat from "./listByChat.js";
import createChatCategory from "./createChatCategory.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
});
