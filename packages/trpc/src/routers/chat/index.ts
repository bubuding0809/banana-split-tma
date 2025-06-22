import getNetShare from "../expenseShare/getNetShare.js";
import addMember from "./addMember.js";
import createChat from "./createChat.js";
import getChat from "./getChat.js";
import getCreditors from "./getCreditors.js";
import getDebtors from "./getDebtors.js";
import getMembers from "./getMembers.js";
import hasMember from "./hasMember.js";
import removeMember from "./removeMember.js";

export const chatRouter = {
  createChat,
  getChat,
  addMember,
  removeMember,
  getMembers,
  hasMember,
  getNetShare,
  getDebtors,
  getCreditors,
};
