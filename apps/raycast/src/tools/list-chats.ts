import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listChats, parseExcludeTypes } from "@bananasplitz/api-ops";

type Input = {
  /** Comma-separated chat types to exclude (private,group,supergroup,channel,sender) */
  excludeTypes?: string;
};

/** List all expense-tracking chats/groups. */
export default async function tool(input: Input) {
  return withToolErrors("list-chats", input, async () => {
    return runTool("list-chats", input, (trpc) =>
      listChats(trpc, { excludeTypes: parseExcludeTypes(input.excludeTypes) }),
    );
  });
}
