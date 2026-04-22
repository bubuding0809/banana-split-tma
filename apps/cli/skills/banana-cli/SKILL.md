---
name: banana-cli
description: >
  Manage shared expenses via the Banana Split CLI. Use when tracking
  group expenses, splitting bills, checking debts, settling payments,
  or working with expense snapshots. Triggers on mentions of Banana Split,
  expense splitting, shared costs, or bill splitting.
metadata:
  author: banananasplitz
  version: "0.9.0"
---

# Banana Split CLI

Agent-first CLI for expense tracking and bill splitting. All interaction is via shell commands that output structured JSON.

## Setup

Authenticate with one of these methods (checked in this order):

1. **Flag**: `banana <command> --api-key <key>` (per-command override)
2. **Env var**: `export BANANA_SPLIT_API_KEY=<key>`
3. **Config file**: `banana login --api-key <key>` (saves to `~/.bananasplit.json`)

If using a **chat-scoped API key**, `--chat-id` is optional on all commands — the API auto-resolves it.

Optionally override the API endpoint with `--api-url <url>` (flag or `banana login --api-url`).

To verify auth works, run:

```bash
banana list-chats
```

## Output Format

- **Success**: JSON to **stdout**, exit code **0**.
- **Error**: JSON to **stderr**, exit code **1**. Shape: `{"error":"<category>","message":"..."}`.
- **BigInt IDs**: User and chat IDs are serialized as **strings** (e.g. `"123456789"`).
- **Machine-readable help**: `banana help` outputs a JSON schema of all commands with their options and types.

Always parse stdout as JSON. Check exit code before reading output.

## Command Reference

| Command                | Key Flags                                                                                                                                                                           | Description                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `help`                 | —                                                                                                                                                                                   | JSON schema of all commands and options                                                                                     |
| `login`                | `--api-key`, `--api-url`                                                                                                                                                            | Save credentials to config file                                                                                             |
| `list-chats`           | `--exclude-types`                                                                                                                                                                   | List all expense-tracking chats                                                                                             |
| `get-chat`             | `--chat-id`                                                                                                                                                                         | Get chat details and member list                                                                                            |
| `get-debts`            | `--chat-id`, `--currencies`                                                                                                                                                         | Get outstanding debts (all currencies)                                                                                      |
| `get-simplified-debts` | `--chat-id`, `--currency` (required)                                                                                                                                                | Optimized debt graph for one currency                                                                                       |
| `update-chat-settings` | `--chat-id`, `--debt-simplification`, `--base-currency`                                                                                                                             | Update chat config                                                                                                          |
| `list-expenses`        | `--chat-id`, `--currency`, `--category`                                                                                                                                             | List expenses, optional currency/category filter; each expense includes a `categoryLabel` field when a category is assigned |
| `get-expense`          | `--expense-id` (required)                                                                                                                                                           | Full details of one expense                                                                                                 |
| `create-expense`       | `--payer-id`, `--description`, `--amount`, `--split-mode`, `--participant-ids` (all required); `--chat-id`, `--creator-id`, `--currency`, `--custom-splits`, `--date`, `--category` | Create expense with split; pass `--category base:<slug>` or `chat:<uuid>` to tag it                                         |
| `update-expense`       | `--expense-id` (required); `--description`, `--amount`, `--payer-id`, `--split-mode`, `--participant-ids`, `--custom-splits`, `--date`, `--category`                                | Update an existing expense; `--category` sets, `--category none` clears, omit to leave unchanged                            |
| `list-categories`      | `--chat-id`                                                                                                                                                                         | List base + custom categories available in a chat (with `id`, `emoji`, `title`, `kind`, `hidden`, `sortOrder`)              |
| `bulk-import-expenses` | `--file` (required); `--chat-id`                                                                                                                                                    | Import multiple expenses from JSON file                                                                                     |
| `get-net-share`        | `--main-user-id`, `--target-user-id`, `--currency` (all required); `--chat-id`                                                                                                      | Balance between two users                                                                                                   |
| `get-totals`           | `--user-id` (required); `--chat-id`                                                                                                                                                 | Total borrowed/lent for a user                                                                                              |
| `list-my-balances`     | —                                                                                                                                                                                   | Outstanding balances across all chats — user-level API key only. Returns per-currency net and counterparties.               |
| `list-my-spending`     | `--month` (required)                                                                                                                                                                | Monthly expense-share damage per chat — user-level API key only.                                                            |
| `list-settlements`     | `--chat-id`, `--currency`                                                                                                                                                           | List past settlements                                                                                                       |
| `create-settlement`    | `--sender-id`, `--receiver-id`, `--amount` (all required); `--chat-id`, `--currency`, `--description`                                                                               | Record a payment                                                                                                            |
| `send-group-reminder`  | `--chat-id`                                                                                                                                                                         | Send a group debt reminder                                                                                                  |
| `send-debt-reminder`   | `--debtor-user-id`, `--debtor-name`, `--creditor-name`, `--amount` (all required); `--chat-id`, `--currency`, `--debtor-username`, `--thread-id`                                    | Send an individual debt reminder                                                                                            |
| `settle-all-debts`     | `--currency` (required); `--chat-id`                                                                                                                                                | Settle all debts in a currency                                                                                              |
| `list-snapshots`       | `--chat-id`                                                                                                                                                                         | List expense snapshots                                                                                                      |
| `get-snapshot`         | `--snapshot-id` (required)                                                                                                                                                          | Full snapshot details                                                                                                       |
| `create-snapshot`      | `--name` (required); `--chat-id`                                                                                                                                                    | Create a new snapshot                                                                                                       |
| `update-snapshot`      | `--snapshot-id`, `--name` (both required)                                                                                                                                           | Update snapshot name                                                                                                        |
| `delete-snapshot`      | `--snapshot-id` (required)                                                                                                                                                          | Delete a snapshot                                                                                                           |
| `get-exchange-rate`    | `--base-currency`, `--target-currency` (both required)                                                                                                                              | Currency exchange rate                                                                                                      |

**Split modes** for `create-expense`:

- `EQUAL` — divide evenly among `--participant-ids`
- `EXACT` / `PERCENTAGE` / `SHARES` — requires `--custom-splits` JSON array: `'[{"userId":123,"amount":30}]'`

## Common Mistakes

1. **Forgetting `--currency` on `get-simplified-debts`** — it is required (not optional like on `get-debts`).
2. **Passing numbers for user/chat IDs in JSON** — the CLI accepts them as strings on flags, but `--custom-splits` JSON must use numbers: `{"userId":123,"amount":30}`.
3. **Using `get-debts` to settle** — use `get-simplified-debts` instead; it minimizes the number of transactions needed.
4. **Omitting `--participant-ids`** — even when the payer is a participant, they must be included in the list.
5. **Not including the payer in `--participant-ids`** — if the payer is sharing the expense, include their ID.
6. **Parsing stderr as success** — always check exit code first. Exit 1 means the JSON is on stderr.
7. **Skipping `get-chat` before `create-expense`** — you need member IDs; don't guess them.
8. **Calling `list-my-*` commands with a chat-scoped API key** — they require a user-level API key. Set `BANANA_SPLIT_API_KEY` to a user-level key or run `banana login --api-key <user-level-key>`.

## Workflows

### Settle All Debts

Resolve all outstanding debts in a chat with the minimum number of payments.

```bash
# Settle all debts for a specific currency
banana settle-all-debts --currency SGD

# Verify debts are cleared
banana get-simplified-debts --currency SGD
# simplified_debts array should be empty
```

### Bulk Import Expenses

Import multiple expenses at once from a JSON file.

```bash
# 1. Prepare a JSON file (e.g., data.json) with an array of expense objects:
# [
#   {
#     "description": "Lunch",
#     "amount": 25.5,
#     "payerId": "12345",
#     "participantIds": ["12345", "67890"],
#     "splitMode": "EQUAL",
#     "date": "2024-03-15T12:00:00Z"
#   }
# ]

# 2. Run the import command
banana bulk-import-expenses --file data.json
```

### Log a Group Meal

Record a shared expense where one person pays and the cost is split equally.

```bash
# 1. Get chat members to find user IDs
CHAT=$(banana get-chat)
# Extract member IDs from CHAT.members[].id

# 2. Create the expense with EQUAL split
banana create-expense \
  --description "Team dinner" \
  --amount 150 \
  --payer-id <payer_user_id> \
  --split-mode EQUAL \
  --participant-ids <id1>,<id2>,<id3>,<id4> \
  --currency SGD

# 3. Confirm the expense was recorded
banana list-expenses --currency SGD
# Verify the new expense appears in the list
```

**Notes**:

- The payer must be included in `--participant-ids` if they are sharing the cost.
- `--creator-id` defaults to `--payer-id` if omitted.
- Omit `--currency` to use the chat's base currency.

### Financial Summary

Build a consolidated view of who owes what across a group.

```bash
# 1. Get all outstanding debts
DEBTS=$(banana get-debts --currencies SGD)

# 2. Get totals for each member
CHAT=$(banana get-chat)
# For each member in CHAT.members:
TOTALS=$(banana get-totals --user-id <member.id>)
# Each returns: { borrowed: <amount>, lent: <amount> }

# 3. Get pairwise balances for specific pairs
NET=$(banana get-net-share \
  --main-user-id <user_a> \
  --target-user-id <user_b> \
  --currency SGD)
# Positive = user_a is owed by user_b
# Negative = user_a owes user_b

# 4. Present consolidated view:
#    - Per-member: total borrowed, total lent
#    - Outstanding debts: who owes whom, how much
#    - Pairwise balances for any specific pairs of interest
```

**Tip**: Combine `get-debts` (raw debt edges) with `get-simplified-debts` (optimized settlements) to show both the detailed breakdown and the efficient settlement plan.

### Personal Cross-Chat Summary

Answer "am I square with everyone?" and "what did I spend this month?" in two calls, not N.

```bash
# 1. Which chats do I have outstanding balances in?
banana list-my-balances
# Each entry: { chatId, chatTitle, debtSimplificationEnabled,
#               currencies: [{currency, net}],
#               counterparties: [{userId, name, currency, net}] }
# net > 0 = owed to me; net < 0 = I owe

# 2. What did I spend last month (my share of expenses)?
banana list-my-spending --month 2026-04
# { month, chats: [{chatId, chatTitle, spend: [{currency, amount}]}],
#   totals: [{currency, amount}] }
```

**Notes:**

- Both commands require a **user-level** API key. Chat-scoped keys will return an auth error.
- `list-my-spending` uses UTC month boundaries and sums only the caller's expense-share amounts — settlements are not counted.
- For per-chat details (full debt graph between every member, not just edges involving caller), drill in with `get-debts --chat-id <id>`.
