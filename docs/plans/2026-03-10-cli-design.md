# Banana Split CLI Design

Agent-first CLI wrapper around the Banana Split tRPC APIs. Published to npm as `@bananasplit/cli` with binary name `banana`.

## Motivation

AI agents (OpenCode, Claude Code, etc.) interact more reliably with CLI tools than MCP servers. The CLI provides a simpler integration path: shell out, pass flags, parse JSON from stdout.

## Approach

Direct tRPC client CLI (Approach A). The CLI creates a tRPC HTTP client and maps subcommands to tRPC procedure calls. No dependency on the MCP server. Minimal code, fast, and the tRPC client setup is ~20 lines.

The MCP server continues to exist. The CLI is an alternative agent interface — we'll evaluate which works better over time.

## Package Structure

```
apps/cli/
├── package.json
├── tsconfig.json
└── src/
    ├── cli.ts            # Entry point (#!/usr/bin/env node), parse args, dispatch
    ├── client.ts         # tRPC client factory
    ├── config.ts         # Auth resolution: flag > env > config file
    ├── output.ts         # JSON output + error formatting
    └── commands/
        ├── chat.ts       # 5 commands
        ├── expense.ts    # 5 commands
        ├── settlement.ts # 2 commands
        ├── snapshot.ts   # 2 commands
        └── currency.ts   # 1 command
```

Dependencies: `@dko/trpc` (workspace, types only), `@trpc/client`, `superjson`, `zod`. CLI parsing via Node.js `util.parseArgs` — no framework.

## Distribution

Published to npm as `@bananasplit/cli`. Binary: `banana`.

```json
{
  "name": "@bananasplit/cli",
  "version": "0.1.0",
  "bin": { "banana": "./dist/cli.js" },
  "files": ["dist"],
  "publishConfig": { "access": "public" }
}
```

Usage:

```bash
npx @bananasplit/cli list-chats --api-key bsk_...
npm install -g @bananasplit/cli && banana list-chats
```

## Command Interface

Flat namespace, kebab-case. 15 commands mirroring the 15 MCP tools:

| Command                | tRPC Procedure                | Required Options                                                                            | Optional Options                                |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `list-chats`           | `chat.listChats`              | —                                                                                           | `--exclude-types`                               |
| `get-chat`             | `chat.getChat`                | `--chat-id`                                                                                 | —                                               |
| `get-debts`            | `chat.getChatDebts`           | `--chat-id`                                                                                 | `--currencies`                                  |
| `get-simplified-debts` | `chat.getSimplifiedDebts`     | `--chat-id`, `--currency`                                                                   | —                                               |
| `update-chat-settings` | `chat.updateChatSettings`     | `--chat-id`                                                                                 | `--base-currency`, `--debt-simplification`      |
| `list-expenses`        | `expense.listExpenses`        | `--chat-id`                                                                                 | `--currency`                                    |
| `get-expense`          | `expense.getExpense`          | `--expense-id`                                                                              | —                                               |
| `create-expense`       | `expense.createExpense`       | `--chat-id`, `--payer-id`, `--amount`, `--description`, `--split-mode`, `--participant-ids` | `--currency`, `--creator-id`, `--custom-splits` |
| `get-net-share`        | `expense.getNetShare`         | `--chat-id`, `--main-user-id`, `--target-user-id`, `--currency`                             | —                                               |
| `get-totals`           | `expense.getTotals`           | `--chat-id`, `--user-id`                                                                    | —                                               |
| `list-settlements`     | `settlement.listSettlements`  | `--chat-id`                                                                                 | `--currency`                                    |
| `create-settlement`    | `settlement.createSettlement` | `--chat-id`, `--sender-id`, `--receiver-id`, `--amount`                                     | `--currency`, `--description`                   |
| `list-snapshots`       | `snapshot.listSnapshots`      | `--chat-id`                                                                                 | —                                               |
| `get-snapshot`         | `snapshot.getSnapshot`        | `--snapshot-id`                                                                             | —                                               |
| `get-exchange-rate`    | `currency.getExchangeRate`    | `--base-currency`, `--target-currency`                                                      | —                                               |

Built-in `help` command lists all commands and options for agent self-discovery.

`--chat-id` is technically optional when using a chat-scoped API key (the backend resolves it). The CLI passes whatever it gets and lets the backend error if needed.

## Authentication

Three-layer resolution, highest priority wins:

1. `--api-key` flag (per-invocation)
2. `BANANA_SPLIT_API_KEY` env var (agent config / CI)
3. `~/.bananasplit.json` config file (persistent)

Config file format:

```json
{
  "apiKey": "bsk_...",
  "apiUrl": "https://api.bananasplit.app/api/trpc"
}
```

Created via `banana login --api-key bsk_... --api-url https://...`. No interactive prompts.

API URL follows the same cascade: `--api-url` flag > `BANANA_SPLIT_API_URL` env > config file > default (`https://api.bananasplit.app/api/trpc`).

## Output

**Stdout:** Always valid JSON. Raw tRPC response data. Nothing else.

```bash
$ banana list-chats
[{"id": 123, "title": "Trip to Japan", "type": "group", "baseCurrency": "SGD"}]
```

**Stderr:** JSON error objects. Exit code 1 for all errors.

```bash
$ banana get-chat
{"error": "missing_option", "message": "--chat-id is required", "command": "get-chat"}
```

Error categories:

- `missing_option` — required flag not provided
- `invalid_option` — bad value (e.g. non-numeric chat-id)
- `auth_error` — no API key found
- `api_error` — tRPC call failed, includes upstream error
- `unknown_command` — not recognized, suggests `banana help`

Exit code 0 only on success.

**BigInt handling:** Telegram user IDs (BigInt) serialized as strings in JSON output.
