import { createTRPCRouter } from "../../trpc.js";
import getNetShare from "../expenseShare/getNetShare.js";
import addMember from "./addMember.js";
import createChat from "./createChat.js";
import getAllChats from "./getAllChats.js";
import getBulkChatDebts from "./getBulkChatDebts.js";
import getChat from "./getChat.js";
import getCreditors from "./getCreditors.js";
import getDebtors from "./getDebtors.js";
import getMembers from "./getMembers.js";
import getSimplifiedDebts from "./getSimplifiedDebts.js";
import hasMember from "./hasMember.js";
import migrateChat from "./migrateChat.js";
import removeMember from "./removeMember.js";
import updateChat from "./updateChat.js";

export const chatRouter = createTRPCRouter({
  createChat,
  getChat,
  getAllChats,
  updateChat,
  migrateChat,
  addMember,
  removeMember,
  getMembers,
  hasMember,
  getNetShare,
  getDebtors,
  getCreditors,
  getSimplifiedDebts,
  getBulkChatDebts,
});
