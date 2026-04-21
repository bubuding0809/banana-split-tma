import listByChat from "./listByChat.js";
import createChatCategory from "./createChatCategory.js";
import updateChatCategory from "./updateChatCategory.js";
import deleteChatCategory from "./deleteChatCategory.js";
import suggestCategory from "./suggestCategory.js";
import setOrdering from "./setOrdering.js";
import resetOrdering from "./resetOrdering.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
  update: updateChatCategory,
  delete: deleteChatCategory,
  suggest: suggestCategory,
  setOrdering,
  resetOrdering,
});
