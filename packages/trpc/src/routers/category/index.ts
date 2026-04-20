import listByChat from "./listByChat.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
});
