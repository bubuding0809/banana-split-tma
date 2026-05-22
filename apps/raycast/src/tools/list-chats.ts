import { runTool, withToolErrors } from "../lib/tools/run-tool";

type ChatType = "private" | "group" | "supergroup" | "channel" | "sender";

type Input = {
  /** Comma-separated chat types to exclude (private,group,supergroup,channel,sender) */
  excludeTypes?: string;
};

/** List all expense-tracking chats/groups. */
export default async function tool(input: Input) {
  return withToolErrors("list-chats", input, async () => {
    return runTool("list-chats", input, (trpc) => {
      const excludeTypes = input.excludeTypes ? (input.excludeTypes.split(",") as ChatType[]) : undefined;
      return trpc.chat.getAllChats.query({ excludeTypes });
    });
  });
}
