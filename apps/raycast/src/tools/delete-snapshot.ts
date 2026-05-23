import { Action, Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { deleteSnapshot, requireField } from "@bananasplitz/api-ops";

type Input = {
  /** Snapshot UUID */
  snapshotId: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Delete snapshot ${input.snapshotId}? Underlying expenses are kept.`,
  style: Action.Style.Destructive,
});

/** Delete a snapshot. */
export default async function tool(input: Input) {
  return withToolErrors("delete-snapshot", input, async () => {
    const snapshotId = requireField(input.snapshotId, "snapshotId");
    return runTool("delete-snapshot", input, (trpc) => deleteSnapshot(trpc, { snapshotId }));
  });
}
