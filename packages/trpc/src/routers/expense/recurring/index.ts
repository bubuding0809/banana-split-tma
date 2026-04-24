import { createTRPCRouter } from "../../../trpc.js";
import list from "./list.js";
import get from "./get.js";
import cancel from "./cancel.js";

export const recurringRouter = createTRPCRouter({
  list,
  get,
  cancel,
});
