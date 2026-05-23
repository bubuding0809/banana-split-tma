import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listCategories } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
};

/** List categories available in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("list-categories", input, async () => {
    return runTool("list-categories", input, (trpc) => listCategories(trpc, { chatId: input.chatId }));
  });
}
