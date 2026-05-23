import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listMyBalances } from "@bananasplitz/api-ops";

/** List outstanding balances across all chats (user-level key). */
export default async function tool() {
  return withToolErrors("list-my-balances", {}, async () => {
    return runTool("list-my-balances", {}, (trpc) => listMyBalances(trpc));
  });
}
