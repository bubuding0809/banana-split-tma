import { createTRPCRouter } from "../../trpc.js";
import generate from "./generate.js";
import revoke from "./revoke.js";
import getScope from "./getScope.js";

export const apiKeyRouter = createTRPCRouter({
  generate,
  revoke,
  getScope,
});
