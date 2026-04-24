import { createTRPCRouter } from "../../../trpc.js";
import list from "./list.js";
import get from "./get.js";
import cancel from "./cancel.js";
import update from "./update.js";

export const recurringRouter = createTRPCRouter({
  list,
  get,
  update,
  cancel,
});
