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

  {
    name: "list-counterparty-balances",
    description:
      "List per-counterparty balance totals across all groups, in chosen base currency.",
    agentGuidance:
      "Use this to answer 'how much do I owe / am I owed per person across all groups?' in one call. Returns aggregated net balances grouped by counterparty, converted to a single base currency. Does not work with chat-scoped API keys.",
    examples: [
      "banana me list-counterparty-balances",
      "banana me list-counterparty-balances --base SGD",
    ],
    options: {
      base: {
        type: "string",
        description:
          "ISO 4217 base currency (defaults to your stored baseCurrency)",
      },
    },
    execute: (opts, trpc) =>
      run("list-counterparty-balances", async () =>
        trpc.expenseShare.getMyCounterpartyBalances.query(
          opts.base ? { baseCurrency: String(opts.base) } : {}
        )
      ),
  },

  {
    name: "settle-all-with",
    description:
      "Zero out every per-group balance with one user (writes one Settlement per chat in native currency).",
    agentGuidance:
      "Use this to clear all shared balances with a specific counterparty across every group in one transaction. Without --yes, prints a preview and exits. With --yes, writes one Settlement row per non-zero (chat, currency) bucket. Does not work with chat-scoped API keys.",
    examples: [
      "banana me settle-all-with --user 123456789",
      "banana me settle-all-with --user 123456789 --yes",
    ],
    options: {
      user: {
        type: "string",
        description: "Counterparty user ID",
        required: true,
      },
      yes: {
        type: "boolean",
        description: "Skip interactive confirmation",
      },
    },
    execute: async (opts, trpc) => {
      if (!opts.user)
        return error("missing_option", "--user required", "settle-all-with");
      const counterpartyUserId = Number(opts.user);
      if (!Number.isFinite(counterpartyUserId)) {
        return error(
          "invalid_option",
          "--user must be a numeric Telegram user id",
          "settle-all-with"
        );
      }
      if (!opts.yes) {
        // Preview first
        const preview = await trpc.expenseShare.getMyCounterpartyBalances.query(
          {}
        );
        const cp = preview.counterparties.find(
          (c) => c.userId === counterpartyUserId
        );
        if (!cp)
          return error(
            "api_error",
            "No outstanding balance with that user",
            "settle-all-with"
          );
        console.log(JSON.stringify(cp, null, 2));
        console.log(
          `\nRe-run with --yes to confirm settling ${cp.groups.length} bucket(s).`
        );
        process.exit(0);
      }
      return run("settle-all-with", async () =>
        trpc.expenseShare.settleAllWithUser.mutate({ counterpartyUserId })
      );
    },
  },
];
