import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listMySpending, requireField } from "@bananasplitz/api-ops";

type Input = {
  /** Month in YYYY-MM (UTC) */
  month: string;
};

/** Sum caller's expense shares per chat for one month. */
export default async function tool(input: Input) {
  return withToolErrors("list-my-spending", input, async () => {
    return runTool("list-my-spending", input, (trpc) =>
      listMySpending(trpc, { month: requireField(input.month, "month") }),
    );
  });
}
