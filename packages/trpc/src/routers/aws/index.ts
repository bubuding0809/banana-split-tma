import { createTRPCRouter } from "../../trpc.js";
import eventbridgeSanityCheck from "./eventbridgeSanityCheck.js";
import createRecurringSchedule from "./createRecurringSchedule.js";
import createGroupReminderSchedule from "./createGroupReminderSchedule.js";
import updateGroupReminderSchedule from "./updateGroupReminderSchedule.js";
import deleteGroupReminderSchedule from "./deleteGroupReminderSchedule.js";

export const awsRouter = createTRPCRouter({
  eventbridgeSanityCheck,
  createRecurringSchedule,
  createGroupReminderSchedule,
  updateGroupReminderSchedule,
  deleteGroupReminderSchedule,
});
