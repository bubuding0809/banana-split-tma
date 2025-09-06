import { createTRPCRouter } from "../../trpc.js";
import classifyExpenseDescription from "./classifyExpenseDescription.js";

export const aiRouter = createTRPCRouter({
  classifyExpenseDescription,
});
