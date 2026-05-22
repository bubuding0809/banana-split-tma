import { runTool, withToolErrors } from "../lib/tools/run-tool";

type Input = {
  /** Unused — no parameters required */
  _?: string;
};

/** List outstanding balances across all chats (user-level API key only). */
export default async function tool(_input: Input) {
  return withToolErrors("list-my-balances", _input, async () => {
    return runTool("list-my-balances", _input, (trpc) => trpc.expenseShare.getMyBalancesAcrossChats.query());
  });
}
