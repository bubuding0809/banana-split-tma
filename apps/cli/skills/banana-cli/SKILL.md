---
name: banana-cli
description: >
  Manage shared expenses via the Banana Split CLI. Use when tracking
  group expenses, splitting bills, checking debts, settling payments,
  or working with expense snapshots. Triggers on mentions of Banana Split,
  expense splitting, shared costs, or bill splitting.
metadata:
  author: banananasplitz
  version: "0.1.2"
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

| Command                | Key Flags                                                                                                                                                   | Description                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `help`                 | —                                                                                                                                                           | JSON schema of all commands and options |
| `login`                | `--api-key`, `--api-url`                                                                                                                                    | Save credentials to config file         |
| `list-chats`           | `--exclude-types`                                                                                                                                           | List all expense-tracking chats         |
| `get-chat`             | `--chat-id`                                                                                                                                                 | Get chat details and member list        |
| `get-debts`            | `--chat-id`, `--currencies`                                                                                                                                 | Get outstanding debts (all currencies)  |
| `get-simplified-debts` | `--chat-id`, `--currency` (required)                                                                                                                        | Optimized debt graph for one currency   |
| `update-chat-settings` | `--chat-id`, `--debt-simplification`, `--base-currency`                                                                                                     | Update chat config                      |
| `list-expenses`        | `--chat-id`, `--currency`                                                                                                                                   | List expenses, optional currency filter |
| `get-expense`          | `--expense-id` (required)                                                                                                                                   | Full details of one expense             |
| `create-expense`       | `--payer-id`, `--description`, `--amount`, `--split-mode`, `--participant-ids` (all required); `--chat-id`, `--creator-id`, `--currency`, `--custom-splits` | Create expense with split               |
| `get-net-share`        | `--main-user-id`, `--target-user-id`, `--currency` (all required); `--chat-id`                                                                              | Balance between two users               |
| `get-totals`           | `--user-id` (required); `--chat-id`                                                                                                                         | Total borrowed/lent for a user          |
| `list-settlements`     | `--chat-id`, `--currency`                                                                                                                                   | List past settlements                   |
| `create-settlement`    | `--sender-id`, `--receiver-id`, `--amount` (all required); `--chat-id`, `--currency`, `--description`                                                       | Record a payment                        |
| `list-snapshots`       | `--chat-id`                                                                                                                                                 | List expense snapshots                  |
| `get-snapshot`         | `--snapshot-id` (required)                                                                                                                                  | Full snapshot details                   |
| `get-exchange-rate`    | `--base-currency`, `--target-currency` (both required)                                                                                                      | Currency exchange rate                  |

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

## Workflows

### Settle All Debts

Resolve all outstanding debts in a chat with the minimum number of payments.

```bash
# 1. Get simplified debts for the currency
DEBTS=$(banana get-simplified-debts --currency SGD)

# 2. Parse each debt and create a settlement
# Each item has: debtorId, creditorId, amount, currency
# Iterate over the simplified_debts array and settle each:
for each debt in DEBTS.simplified_debts:
  banana create-settlement \
    --sender-id <debt.debtorId> \
    --receiver-id <debt.creditorId> \
    --amount <debt.amount> \
    --currency <debt.currency>

# 3. Verify debts are cleared
banana get-simplified-debts --currency SGD
# simplified_debts array should be empty
```

**Important**: Use `get-simplified-debts`, not `get-debts`. Simplified debts minimize the number of transfers needed to settle everyone.

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
