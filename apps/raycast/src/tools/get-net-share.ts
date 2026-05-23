import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getNetShare, requireField } from "@bananasplitz/api-ops";

type Input = {
  mainUserId: string;
  targetUserId: string;
  chatId?: string;
  currency: string;
};

/** Net balance between two users in a chat for one currency. */
export default async function tool(input: Input) {
  return withToolErrors("get-net-share", input, async () => {
    return runTool("get-net-share", input, (trpc) =>
      getNetShare(trpc, {
        mainUserId: requireField(input.mainUserId, "mainUserId"),
        targetUserId: requireField(input.targetUserId, "targetUserId"),
        chatId: input.chatId,
        currency: requireField(input.currency, "currency"),
      }),
    );
  });
}
