---
name: banana-cli
description: >
  Manage shared expenses via the Banana Split CLI. Use when tracking
  group expenses, splitting bills, checking debts, settling payments,
  or working with expense snapshots. Triggers on mentions of Banana Split,
  expense splitting, shared costs, or bill splitting.
metadata:
  author: banananasplitz
  version: "0.17.3"
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

### Handling Large Output in Python Subprocesses

When executing CLI commands inside Python scripts (e.g. within an `execute_code` block) that return large JSON payloads (like `list-expenses` on busy groups, which can easily exceed 64KB), standard pipes like `subprocess.run(..., capture_output=True)` may get truncated or blocked due to system buffer limits.

Always redirect the CLI stdout to a temporary file and parse it directly in Python:

```python
import subprocess
import json
import os

# Safe execution: redirect to a file first
subprocess.run("banana list-expenses --chat-id -123456 > temp.json", shell=True)
with open("temp.json", "r") as f:
    expenses = json.load(f)
os.remove("temp.json")
```

## Command Reference

| Command                         | Key Flags                                                                                                                                                                                                                                                                                                         | Description                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `help`                          | —                                                                                                                                                                                                                                                                                                                 | JSON schema of all commands and options                                                                                                                                                                                  |
| `login`                         | `--api-key`, `--api-url`                                                                                                                                                                                                                                                                                          | Save credentials to config file                                                                                                                                                                                          |
| `list-chats`                    | `--exclude-types`                                                                                                                                                                                                                                                                                                 | List all expense-tracking chats                                                                                                                                                                                          |
| `get-chat`                      | `--chat-id`                                                                                                                                                                                                                                                                                                       | Get chat details and member list                                                                                                                                                                                         |
| `get-debts`                     | `--chat-id`, `--currencies`                                                                                                                                                                                                                                                                                       | Get outstanding debts (all currencies)                                                                                                                                                                                   |
| `get-simplified-debts`          | `--chat-id`, `--currency` (required)                                                                                                                                                                                                                                                                              | Optimized debt graph for one currency                                                                                                                                                                                    |
| `update-chat-settings`          | `--chat-id`, `--debt-simplification`, `--base-currency`                                                                                                                                                                                                                                                           | Update chat config                                                                                                                                                                                                       |
| `list-expenses`                 | `--chat-id`, `--currency`, `--category`                                                                                                                                                                                                                                                                           | List expenses, optional currency/category filter; each expense includes a `categoryLabel` field when a category is assigned                                                                                              |
| `get-expense`                   | `--expense-id` (required)                                                                                                                                                                                                                                                                                         | Full details of one expense                                                                                                                                                                                              |
| `create-expense`                | `--payer-id`, `--description`, `--amount`, `--split-mode`, `--participant-ids` (all required); `--chat-id`, `--creator-id`, `--currency`, `--custom-splits`, `--date`, `--category`, `--recurrence-frequency`, `--recurrence-interval`, `--recurrence-weekdays`, `--recurrence-end-date`, `--recurrence-timezone` | Create expense with split; pass `--category base:<slug>` or `chat:<uuid>` to tag it                                                                                                                                      |
| `update-expense`                | `--expense-id` (required); `--description`, `--amount`, `--payer-id`, `--split-mode`, `--participant-ids`, `--custom-splits`, `--date`, `--category`                                                                                                                                                              | Update an existing expense; `--category` sets, `--category none` clears, omit to leave unchanged                                                                                                                         |
| `list-recurring-expenses`       | `--chat-id`                                                                                                                                                                                                                                                                                                       | List active recurring expense templates                                                                                                                                                                                  |
| `get-recurring-expense`         | `--template-id` (required)                                                                                                                                                                                                                                                                                        | Full details of a recurring template                                                                                                                                                                                     |
| `update-recurring-expense`      | `--template-id` (required); `--amount`, `--description`, `--frequency`, `--interval`, `--weekdays`, `--end-date`                                                                                                                                                                                                  | Update the schedule or locked details of an active template                                                                                                                                                              |
| `cancel-recurring-expense`      | `--template-id` (required)                                                                                                                                                                                                                                                                                        | Cancel an active recurring template                                                                                                                                                                                      |
| `list-categories`               | `--chat-id`                                                                                                                                                                                                                                                                                                       | List base + custom categories available in a chat (with `id`, `emoji`, `title`, `kind`, `hidden`, `sortOrder`)                                                                                                           |
| `bulk-import-expenses`          | `--file` (required); `--chat-id`, `--notify`                                                                                                                                                                                                                                                                      | Import multiple expenses from JSON file. Per-row Telegram notifications are always silent; pass `--notify` for a single condensed summary message after the batch.                                                       |
| `bulk-update-expenses`          | `--file` (required); `--chat-id`, `--notify`                                                                                                                                                                                                                                                                      | Update multiple expenses from JSON file; each row is a partial update keyed by `expenseId`. Per-row notifications are suppressed; pass `--notify` for a single condensed summary message. Failures are reported per-row. |
| `get-net-share`                 | `--main-user-id`, `--target-user-id`, `--currency` (all required); `--chat-id`                                                                                                                                                                                                                                    | Balance between two users                                                                                                                                                                                                |
| `get-totals`                    | `--user-id` (required); `--chat-id`                                                                                                                                                                                                                                                                               | Total borrowed/lent for a user                                                                                                                                                                                           |
| `list-my-balances`              | —                                                                                                                                                                                                                                                                                                                 | Outstanding balances across all chats — user-level API key only. Returns per-currency net and counterparties.                                                                                                            |
| `list-my-spending`              | `--month` (required)                                                                                                                                                                                                                                                                                              | Monthly expense-share damage per chat — user-level API key only.                                                                                                                                                         |
| `me list-counterparty-balances` | `--base`                                                                                                                                                                                                                                                                                                          | Cross-group totals per counterparty, converted to a single base currency — user-level API key only.                                                                                                                      |
| `me settle-all-with`            | `--user` (required), `--yes`                                                                                                                                                                                                                                                                                      | Clear every shared balance with one counterparty across all groups in one transaction — user-level API key only. Without `--yes`, shows a preview and exits.                                                             |
| `list-settlements`              | `--chat-id`, `--currency`                                                                                                                                                                                                                                                                                         | List past settlements                                                                                                                                                                                                    |
| `create-settlement`             | `--sender-id`, `--receiver-id`, `--amount` (all required); `--chat-id`, `--currency`, `--description`                                                                                                                                                                                                             | Record a payment                                                                                                                                                                                                         |
| `create-transfer`               | `--from-chat`, `--to-chat`, `--debtor`, `--creditor`, `--amount` (all required); `--currency`, `--description`                                                                                                                                                                                                    | Relocate a debt from one chat to another without logging consumption spending — clears it in the source chat, adds it in the target. User-level API key only; debtor must already owe the creditor in the source chat.   |
| `list-transfers`                | `--chat-id`                                                                                                                                                                                                                                                                                                       | List debt transfers touching a chat; each row has `direction` (out/in) + counterpart group. Use to find a transfer id.                                                                                                   |
| `delete-transfer`               | `--transfer-id` (required)                                                                                                                                                                                                                                                                                        | Delete a transfer by ID; reverses it in both groups.                                                                                                                                                                     |
| `send-group-reminder`           | `--chat-id`                                                                                                                                                                                                                                                                                                       | Send a group debt reminder                                                                                                                                                                                               |
| `send-debt-reminder`            | `--debtor-user-id`, `--debtor-name`, `--creditor-name`, `--amount` (all required); `--chat-id`, `--currency`, `--debtor-username`, `--thread-id`                                                                                                                                                                  | Send an individual debt reminder                                                                                                                                                                                         |
| `settle-all-debts`              | `--currency` (required); `--chat-id`                                                                                                                                                                                                                                                                              | Settle all debts in a currency                                                                                                                                                                                           |
| `list-snapshots`                | `--chat-id`                                                                                                                                                                                                                                                                                                       | List expense snapshots                                                                                                                                                                                                   |
| `get-snapshot`                  | `--snapshot-id` (required)                                                                                                                                                                                                                                                                                        | Full snapshot details                                                                                                                                                                                                    |
| `create-snapshot`               | `--name` (required); `--chat-id`                                                                                                                                                                                                                                                                                  | Create a new snapshot                                                                                                                                                                                                    |
| `update-snapshot`               | `--snapshot-id`, `--name` (both required)                                                                                                                                                                                                                                                                         | Update snapshot name                                                                                                                                                                                                     |
| `delete-snapshot`               | `--snapshot-id` (required)                                                                                                                                                                                                                                                                                        | Delete a snapshot                                                                                                                                                                                                        |
| `get-exchange-rate`             | `--base-currency`, `--target-currency` (both required)                                                                                                                                                                                                                                                            | Currency exchange rate                                                                                                                                                                                                   |

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
9. **Confusing `expenseId` and `templateId`** — recurring management commands take a `--template-id`, while normal expense commands take an `--expense-id`.
10. **Trying to delete past recurrences via `cancel-recurring-expense`** — cancelling a template only stops _future_ runs; previously generated expenses remain intact.
11. **Sizing a transfer relative to simplification**: `create-transfer` natively respects the active simplification status of the group. If the source group has `debtSimplificationEnabled: true` set, you can (and should) size the transfer exactly to the on-screen simplified balance (retrieved via `get-simplified-debts`). If simplification is disabled, size the transfer to the direct raw pairwise debt (retrieved via `get-debts`). This makes transfers intuitive and seamless without requiring manual raw translation on simplified groups.
12. **Flipping the direction of cross-group debt transfers** — `--from-chat` is the group where the debt is **cleared** (debtor must already owe creditor there); `--to-chat` is where it is **added**. When offsetting cross-group debt: put the group where you **are owed** in `--from-chat`, the group where you **owe** in `--to-chat`, the person who owes you in `--debtor`, and yourself in `--creditor`. Example: Bob owes you S$50 in Group B, you owe Bob S$50 in Group A → `--from-chat <Group B> --to-chat <Group A> --debtor <Bob> --creditor <you>`. Swapping `--from-chat`/`--to-chat` fails the solvency check (`Debtor only owes 0.00 ... in the source chat`); swapping `--debtor`/`--creditor` **doubles** your Group A liability instead of clearing it.
13. **Assuming `list-my-spending` uses UTC month boundaries** — it does not. Each chat's month window is computed in that chat's own timezone (`Chat.timezone`, defaulting to `Asia/Singapore` when null) and converted to UTC before querying. A transaction logged 12:00–07:59 AM SGT on the 1st (stored as the prior day in UTC) is counted in the correct local month. Chats in different timezones use different windows for the same `--month`.

## Workflows

### Testing / UAT against the Local Development Server

When testing CLI modifications against the local dev environment (`http://localhost:8081/api/trpc`), the `.env.development` file usually has its `API_KEY` redacted.
You **must** generate a test key and inject it straight into the local `prisma` database to test safely without authenticating as superadmin.

```bash
# 1. Generate Prisma Client
cd packages/database && npx prisma generate

# 2. Inject a Mock Key via a node script using Prisma
node -e '
const { PrismaClient } = require("./generated/client");
const crypto = require("node:crypto");
const prisma = new PrismaClient();
async function main() {
  const dummyApiKey = "test-local-key";
  const keyHash = crypto.createHash("sha256").update(dummyApiKey).digest("hex");

  // Grab the first existing chat and user
  const chat = await prisma.chat.findFirst();
  const user = await prisma.user.findFirst();

  await prisma.chatApiKey.upsert({
    where: { keyHash },
    update: {},
    create: {
      keyHash,
      keyPrefix: "dev-",
      chat: { connect: { id: chat.id } },
      createdBy: { connect: { id: user.id } }
    }
  });
  console.log("Created API Key:", dummyApiKey, "for chat:", chat.id);
}
main().catch(console.error).finally(() => prisma.$disconnect());
'
```

**Notes:**

- Do not use `INTERNAL_AGENT_KEY` for CLI tests; the backend requires specific x-agent headers.
- The `chatApiKey` table strictly requires the `keyPrefix`, `chat` relation, and `createdBy` relation.
- Once created, test using `--api-url http://localhost:8081/api/trpc --api-key test-local-key`.
- Chat-scoped API keys (like this one) are rejected by user-scoped endpoints like `list-chats`, `list-my-balances`, etc. Use them explicitly for chat-scoped commands like `create-expense`, `update-expense`, and `list-expenses`.

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
- `list-my-spending` computes the month window in each chat's own timezone (`Chat.timezone`, defaulting to `Asia/Singapore` when null), then converts those local boundaries to UTC before querying. So for an SGT chat, `--month 2026-06` covers `[2026-05-31T16:00Z, 2026-06-30T16:00Z)` — early-morning-of-the-1st transactions land in the correct local month. Chats in different timezones use different UTC windows for the same `--month`. Settlements are never counted in spending.
- For per-chat details (full debt graph between every member, not just edges involving caller), drill in with `get-debts --chat-id <id>`.

### Cross-Group Balance Overview and Settlement

See every person you share expenses with across all groups and settle up with one command.

#### `me list-counterparty-balances [--base <ISO>]`

Lists every counterparty across all your groups with a per-(group, currency) breakdown and a total in your base currency. Defaults `--base` to the value stored on your User row.

```bash
# Using stored base currency
banana me list-counterparty-balances

# Override base currency
banana me list-counterparty-balances --base USD
```

#### `me settle-all-with --user <id> [--yes]`

Without `--yes`, prints the balance preview and exits. With `--yes`, writes one `Settlement` row per non-zero (chat, currency) bucket in native currency. The counterparty is DM'd a summary by the bot if they have started a private chat with it.

```bash
# Preview what would be settled (safe — no writes)
banana me settle-all-with --user 123456789

# Confirm and settle all buckets
banana me settle-all-with --user 123456789 --yes
```

**Notes:**

- Both commands require a **user-level** API key. Chat-scoped keys will return an auth error.
- `settle-all-with` is atomic: all settlements across every group are written in a single server transaction. If any bucket fails, none are committed.
- The `--user` flag accepts a numeric Telegram user ID (same as the `id` field in `get-chat` member lists).
- If there is no outstanding balance with the given user, the command exits with `api_error`.

### Manage a Subscription

Create a recurring expense and update it later.

````bash
# 1. Create a monthly subscription
banana create-expense \
  --description "Spotify" \
  --amount 15.90 \
  --payer-id <payer_user_id> \
  --split-mode EQUAL \
  --participant-ids <id1>,<id2> \
  --recurrence-frequency MONTHLY

# 2. Check the active recurring templates to get the templateId
banana list-recurring-expenses

# 3. Increase the price of the subscription
banana update-recurring-expense \
  --template-id <uuid> \
  --amount 16.90

### Future-Dating and Consolidating Scheduled Expenses

Because the Banana Split API rejects future-dated expenses, you cannot create an expense with a date in the future. To "shift" or schedule an expense for a future date (e.g. the 1st of next month), use the following one-shot cron job workflow:

#### 1. Individual Future-Dated Expense
Create a one-shot cron job to run on the target date.
```json
{
  "action": "create",
  "name": "Create June 1 Taobao topup personal expense",
  "schedule": "2026-06-01T00:00:00+08:00",
  "skills": ["banana-cli"],
  "prompt": "Create the user's personal Banana Split expense on June 1 only.\n\nDetails:\n- Chat/private ledger ID: 259941064\n- Description: alipay taobao topup\n- Amount: 520\n- Currency: SGD\n- Split mode: EQUAL\n- Category: base:shopping\n\nBefore creating, check for duplicates by listing SGD expenses in chat 259941064 and looking for an existing expense with amount 520, description containing 'alipay taobao topup', and date around June 1. If one exists, do not create another."
}
````

#### 2. Consolidated Master Future-Dated Expenses (The Consolidation Pattern)

If there are multiple expenses scheduled for the same future date, **do not** create multiple individual cron jobs spaced minutes apart. Instead, consolidate them into a single, unified master cron job to minimize API calls, reduce ledger spam, and maintain a clean scheduler.

Create a single consolidated one-shot cron job with an idempotent prompt:

```json
{
  "action": "create",
  "name": "Create June 1 Consolidated Taobao and Alipay Expenses",
  "schedule": "2026-06-01T00:00:00+08:00",
  "skills": ["banana-cli"],
  "prompt": "Create Ruoqian's six personal Banana Split expenses on June 1 only.\n\nDetails of the 6 expenses to log (Chat/private ledger ID: '259941064', Payer: '259941064', Participant IDs: ['259941064'], Currency: SGD, Split Mode: EQUAL, Category: base:shopping):\n1. Description: 'alipay taobao topup', Amount: 520.00, Date: June 1, 2026\n2. Description: 'Big Taobao purchase', Amount: 870.00, Date: June 1, 2026\n3. Description: 'alipay taobao topup', Amount: 376.00, Date: June 1, 2026\n4. Description: 'Taobao chaser bike parts', Amount: 165.40, Date: June 1, 2026\n5. Description: 'last Taobao haul for 618', Amount: 66.40, Date: June 1, 2026\n6. Description: 'pocket money (gf)', Amount: 1000.00, Date: June 1, 2026\n\nFor each of the 6 expenses:\n- List SGD expenses in chat 259941064 to check for existing duplicates matching the amount and description keywords.\n- If a duplicate already exists for that item, skip creation.\n- If no duplicate exists, run banana create-expense with the corresponding details.\n\nFinally, output a clear, consolidated summary of all 6 items: whether they were newly created (with their expense IDs) or skipped as duplicates."
}
```

This pattern keeps the system exceptionally clean, enforces rigorous idempotency, and delivers a single, cohesive notification summary upon execution.

### Telegram Mini App Deep Links

To provide the user with direct links to view or manage logged resources inside the Telegram Mini App (TMA), use the following standard URL patterns:

- **Format**: `https://t.me/<bot_username>?startapp=v1_<g|p>_<base62_chat_id>_<e|rt>_<base62_entity_id>`
  - Where `<bot_username>` is usually `BananaSplitzBot` (production).
  - Use `g` for groups/supergroups and `p` for private/personal chats.
  - **Crucial Rule**: Both `<chat_id>` and `<entity_id>` (UUID) MUST be Base62 encoded as defined in `packages/trpc/src/utils/deepLinkProtocol.ts`. Do NOT use raw IDs or raw UUIDs.

#### Encoder Reference (JavaScript)

```javascript
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = BigInt(ALPHABET.length);

function encodeBase62(num) {
  if (num < 0n) throw new Error("Cannot encode negative numbers");
  if (num === 0n) return ALPHABET[0];
  let str = "";
  let current = num;
  while (current > 0n) {
    str = ALPHABET[Number(current % BASE)] + str;
    current = current / BASE;
  }
  return str;
}

function encodeV1DeepLink(chatId, chatType, entityType, entityId) {
  const absChatId = chatId < 0n ? -chatId : chatId;
  const chatIdStr = (chatId < 0n ? "-" : "") + encodeBase62(absChatId);
  let payload = `v1_${chatType}_${chatIdStr}`;
  if (entityType && entityId) {
    const hexUuid = entityId.replace(/-/g, "");
    const uuidBigInt = BigInt("0x" + hexUuid);
    const uuidStr = encodeBase62(uuidBigInt);
    payload += `_${entityType}_${uuidStr}`;
  }
  return payload;
}
```

- **Example of properly encoded Expense link**: `https://t.me/BananaSplitzBot?startapp=v1_p_hAGxO_e_4yVoxOgZmt1TOyLYnVTqgc` (Chat ID: `259941064`, Expense ID: `95efb0f0-9cde-48a0-ae71-902336b8bbcc`).

```

```
