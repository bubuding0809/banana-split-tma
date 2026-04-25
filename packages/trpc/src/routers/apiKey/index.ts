import { createTRPCRouter } from "../../trpc.js";
import generate from "./generate.js";
import revoke from "./revoke.js";
import getScope from "./getScope.js";
import generateToken from "./generateToken.js";
import listTokens from "./listTokens.js";
import revokeToken from "./revokeToken.js";
import renameToken from "./renameToken.js";
import generateUserToken from "./generateUserToken.js";
import listUserTokens from "./listUserTokens.js";
import revokeUserToken from "./revokeUserToken.js";

export const apiKeyRouter = createTRPCRouter({
  generate,
  revoke,
  getScope,
  generateToken,
  listTokens,
  revokeToken,
  renameToken,
  generateUserToken,
  listUserTokens,
  revokeUserToken,
});
