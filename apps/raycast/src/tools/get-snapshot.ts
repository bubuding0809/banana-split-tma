import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getSnapshot, requireField } from "@bananasplitz/api-ops";

type Input = {
  /** Snapshot UUID */
  snapshotId: string;
};

/** Get snapshot details. */
export default async function tool(input: Input) {
  return withToolErrors("get-snapshot", input, async () => {
    return runTool("get-snapshot", input, (trpc) =>
      getSnapshot(trpc, {
        snapshotId: requireField(input.snapshotId, "snapshotId"),
      }),
    );
  });
}
