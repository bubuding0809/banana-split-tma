import { Action, Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { parseCounterpartyUserId, settleAllWith } from "@bananasplitz/api-ops";

type Input = {
  /** Counterparty Telegram user ID */
  user: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const counterpartyUserId = parseCounterpartyUserId(input.user);
  return {
    message: `Settle all outstanding balances with user ${counterpartyUserId} across every group? This writes one settlement per non-zero currency bucket and may notify members.`,
    style: Action.Style.Regular,
  };
};

/** Zero out every per-group balance with one user (user-level API key only). */
export default async function tool(input: Input) {
  return withToolErrors("settle-all-with", input, async () => {
    const counterpartyUserId = parseCounterpartyUserId(input.user);
    return runTool("settle-all-with", input, (trpc) => settleAllWith(trpc, { counterpartyUserId }));
  });
}
