import { createTRPCRouter } from "../../trpc.js";
import getUsers from "./getUsers.js";
import broadcastMessage from "./broadcastMessage.js";
import broadcastList from "./broadcastList.js";
import broadcastGet from "./broadcastGet.js";
import broadcastRetract from "./broadcastRetract.js";
import broadcastEdit from "./broadcastEdit.js";

export const adminRouter = createTRPCRouter({
  getUsers,
  broadcastMessage,
  broadcastList,
  broadcastGet,
  broadcastRetract,
  broadcastEdit,
});
