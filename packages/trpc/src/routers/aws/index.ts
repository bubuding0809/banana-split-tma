import { createTRPCRouter } from "../../trpc.js";
import eventbridgeSanityCheck from "./eventbridgeSanityCheck.js";

export const awsRouter = createTRPCRouter({
  eventbridgeSanityCheck,
});
