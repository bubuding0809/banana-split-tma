import { Action, Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Settlement UUID */
  settlementId: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Delete settlement ${input.settlementId}?`,
  style: Action.Style.Destructive,
});

/** Delete a settlement (undo payment). */
export default async function tool(input: Input) {
  return withToolErrors("delete-settlement", input, async () => {
    const settlementId = requireField(input.settlementId, "settlementId");
    return runTool("delete-settlement", input, (trpc) => trpc.settlement.deleteSettlement.mutate({ settlementId }));
  });
}
