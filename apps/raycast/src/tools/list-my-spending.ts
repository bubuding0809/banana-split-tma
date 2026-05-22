import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { MONTH_RE, requireField } from "../lib/tools/parse";

type Input = {
  /** Month in YYYY-MM format (UTC boundaries). Example: 2026-04 */
  month: string;
};

/** Sum expense shares per chat for one month (user-level API key only). */
export default async function tool(input: Input) {
  return withToolErrors("list-my-spending", input, async () => {
    const month = requireField(input.month, "month");
    if (!MONTH_RE.test(month)) {
      throw new Error("month must be YYYY-MM (e.g. 2026-04)");
    }
    return runTool("list-my-spending", input, (trpc) => trpc.expenseShare.getMySpendByMonth.query({ month }));
  });
}
