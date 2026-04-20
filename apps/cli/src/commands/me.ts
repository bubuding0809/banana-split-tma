import type { Command } from "./types.js";
import { run, error } from "../output.js";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const meCommands: Command[] = [
  {
    name: "list-my-balances",
    description:
      "List outstanding balances for the authenticated user across all chats (user-level API key only)",
    agentGuidance:
      "Use this to answer 'which chats do I owe/am I owed in?' in one call. Each chat row includes counterparties filtered to pairs involving the caller. Does not work with chat-scoped API keys.",
    examples: ["banana list-my-balances"],
    options: {},
    execute: (_opts, trpc) =>
      run("list-my-balances", async () =>
        trpc.expenseShare.getMyBalancesAcrossChats.query()
      ),
  },

  {
    name: "list-my-spending",
    description:
      "Sum the authenticated user's expense shares per chat for one month (user-level API key only)",
    agentGuidance:
      "Use this to answer 'what did I spend this month in each group?'. Amount = caller's share of expenses dated in the given UTC month. Does not count settlements.",
    examples: ["banana list-my-spending --month 2026-04"],
    options: {
      month: {
        type: "string",
        description:
          "Month in YYYY-MM format (UTC boundaries). Example: 2026-04",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts.month) {
        return error(
          "missing_option",
          "--month is required",
          "list-my-spending"
        );
      }
      const month = String(opts.month);
      if (!MONTH_RE.test(month)) {
        return error(
          "invalid_option",
          "--month must be YYYY-MM (e.g. 2026-04)",
          "list-my-spending"
        );
      }
      return run("list-my-spending", async () =>
        trpc.expenseShare.getMySpendByMonth.query({ month })
      );
    },
  },
];
