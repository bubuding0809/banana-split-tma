import { createTRPCRouter } from "../../trpc.js";
import getUsers from "./getUsers.js";
import broadcastMessage from "./broadcastMessage.js";

export const adminRouter = createTRPCRouter({
  getUsers,
  broadcastMessage,
});
