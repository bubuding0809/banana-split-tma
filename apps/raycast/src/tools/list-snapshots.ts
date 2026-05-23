import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listSnapshots } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
};

/** List expense snapshots in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("list-snapshots", input, async () => {
    return runTool("list-snapshots", input, (trpc) => listSnapshots(trpc, { chatId: input.chatId }));
  });
}
