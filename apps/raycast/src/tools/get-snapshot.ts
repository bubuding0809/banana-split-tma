import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Snapshot UUID */
  snapshotId: string;
};

/** Get snapshot details. */
export default async function tool(input: Input) {
  return withToolErrors("get-snapshot", input, async () => {
    const snapshotId = requireField(input.snapshotId, "snapshotId");
    return runTool("get-snapshot", input, (trpc) => trpc.snapshot.getDetails.query({ snapshotId }));
  });
}
