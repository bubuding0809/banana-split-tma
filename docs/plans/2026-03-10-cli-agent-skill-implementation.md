# CLI Agent Skill — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship an Agent Skills spec-compliant skill inside the `@banananasplitz/cli` npm package, with a `banana install-skill` command that prints its filesystem path.

**Architecture:** Add a `skills/banana-cli/SKILL.md` file to `apps/cli/`, update `package.json` to include it in the npm tarball, add `install-skill` as a built-in command in `cli.ts`, and update the README.

**Tech Stack:** Markdown (Agent Skills spec), Node.js (`import.meta.url` for path resolution)

---

### Task 1: Create the SKILL.md file

**Files:**

- Create: `apps/cli/skills/banana-cli/SKILL.md`

**Step 1: Write the skill file**

````markdown
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

Agent-first CLI for expense tracking and bill splitting. All commands output JSON to stdout (exit 0) or JSON errors to stderr (exit 1).

## Setup

```bash
# Authenticate (one-time)
banana login --api-key <your-key>
```
````

Auth resolution order: `--api-key` flag > `BANANA_SPLIT_API_KEY` env var > `~/.bananasplit.json` config file.

Run `banana help` for a machine-readable JSON schema of all commands and options.

## Output Format

- **Success**: JSON to stdout, exit code 0
- **Error**: `{"error": "<category>", "message": "..."}` to stderr, exit code 1
- **BigInt IDs**: User IDs and chat IDs are serialized as strings (e.g. `"123456789"` not `123456789`) to avoid JavaScript number overflow

## Commands

| Command                | Description                | Key Flags                                                                                     |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `list-chats`           | List all chats/groups      | `--exclude-types`                                                                             |
| `get-chat`             | Get chat details + members | `--chat-id`                                                                                   |
| `get-debts`            | Get outstanding debts      | `--chat-id`, `--currencies`                                                                   |
| `get-simplified-debts` | Get optimized debt graph   | `--chat-id`, `--currency` (required)                                                          |
| `update-chat-settings` | Update chat config         | `--chat-id`, `--debt-simplification`, `--base-currency`                                       |
| `list-expenses`        | List expenses              | `--chat-id`, `--currency`                                                                     |
| `get-expense`          | Get expense details        | `--expense-id` (required)                                                                     |
| `create-expense`       | Create an expense          | `--payer-id`, `--description`, `--amount`, `--split-mode`, `--participant-ids` (all required) |
| `get-net-share`        | Balance between two users  | `--main-user-id`, `--target-user-id`, `--currency` (all required)                             |
| `get-totals`           | Total borrowed/lent        | `--user-id` (required), `--chat-id`                                                           |
| `list-settlements`     | List settlements           | `--chat-id`, `--currency`                                                                     |
| `create-settlement`    | Record a payment           | `--sender-id`, `--receiver-id`, `--amount` (all required)                                     |
| `list-snapshots`       | List snapshots             | `--chat-id`                                                                                   |
| `get-snapshot`         | Get snapshot details       | `--snapshot-id` (required)                                                                    |
| `get-exchange-rate`    | Get exchange rate          | `--base-currency`, `--target-currency` (both required)                                        |

All commands accept `--api-key` and `--api-url` global options. Commands with `--chat-id` auto-resolve it when using a chat-scoped API key.

## Common Mistakes

- **Don't parse user/chat IDs as numbers** — they are BigInts serialized as strings. Store and pass them as strings.
- **Don't forget `--currency`** for `get-simplified-debts`, `get-net-share`, and `get-exchange-rate` — these require it.
- **Don't pass `--chat-id` with chat-scoped API keys** — it auto-resolves. Passing an explicit ID that doesn't match will error.
- **Use `get-simplified-debts` instead of `get-debts`** when you want the minimal set of payments to settle all debts. `get-debts` returns the raw debt graph; `get-simplified-debts` optimizes it.
- **`create-expense` with non-EQUAL splits** requires `--custom-splits` as a JSON array: `'[{"userId":123,"amount":30}]'`

## Workflows

### Settle all debts in a group

```bash
# 1. Get the optimized debt graph
banana get-simplified-debts --currency SGD

# 2. For each debt in the result, create a settlement
banana create-settlement \
  --sender-id <debtor_id> \
  --receiver-id <creditor_id> \
  --amount <amount> \
  --currency SGD

# 3. Verify debts are cleared
banana get-simplified-debts --currency SGD
# Should return empty debts array
```

### Log a group meal or event

```bash
# 1. Get chat members to find user IDs
banana get-chat

# 2. Create the expense split equally among participants
banana create-expense \
  --description "Team dinner" \
  --amount 120 \
  --payer-id <who_paid> \
  --split-mode EQUAL \
  --participant-ids <id1>,<id2>,<id3>

# 3. Confirm it was recorded
banana list-expenses --currency SGD
```

### Get a financial summary for a group

```bash
# 1. Get all outstanding debts
banana get-debts

# 2. Get totals for each member
banana get-totals --user-id <user_id>
# Repeat for each member

# 3. Get simplified settlements needed
banana get-simplified-debts --currency SGD

# Present: who owes whom, total borrowed/lent per person,
# and the minimum payments needed to settle up
```

````

**Step 2: Verify the file is valid**

Check: The file has YAML frontmatter with `name` and `description`, body is Markdown, name matches directory name (`banana-cli`), and it's under 500 lines.

**Step 3: Commit**

```bash
git add apps/cli/skills/banana-cli/SKILL.md
git commit -m "feat(cli): add Agent Skills spec-compliant skill file"
````

---

### Task 2: Add `install-skill` command to cli.ts

**Files:**

- Modify: `apps/cli/src/cli.ts:28-70` (showHelp function) and `apps/cli/src/cli.ts:97-109` (main function)

**Step 1: Add install-skill to the help output**

In `showHelp()`, add `install-skill` to the commands array alongside `help` and `login`:

```typescript
{
  name: "install-skill",
  description: "Print the path to the bundled Agent Skill directory",
  options: [],
},
```

**Step 2: Add handleInstallSkill function**

Add before `main()`:

```typescript
function handleInstallSkill(): never {
  const skillDir = new URL("../skills/banana-cli", import.meta.url);
  const skillPath = fileURLToPath(skillDir);
  return success({
    skill_path: skillPath,
    skill_name: "banana-cli",
    hint: "Copy this directory to your agent's skills location",
  });
}
```

Add the import at the top:

```typescript
import { fileURLToPath } from "node:url";
```

**Step 3: Add install-skill dispatch in main()**

After the `login` handler and before the regular command dispatch, add:

```typescript
if (commandName === "install-skill") {
  return handleInstallSkill();
}
```

**Step 4: Build and test locally**

```bash
cd apps/cli
pnpm build
node dist/cli.js install-skill
```

Expected: JSON with `skill_path` pointing to the skills directory.

**Step 5: Run type checking**

```bash
turbo check-types --filter=@banananasplitz/cli
```

Expected: No errors.

**Step 6: Commit**

```bash
git add apps/cli/src/cli.ts
git commit -m "feat(cli): add install-skill command for agent skill discovery"
```

---

### Task 3: Update package.json to include skills in npm tarball

**Files:**

- Modify: `apps/cli/package.json:10-12` (files array)

**Step 1: Add skills to files array**

Change the `files` field from:

```json
"files": [
  "dist"
],
```

to:

```json
"files": [
  "dist",
  "skills"
],
```

**Step 2: Verify the tarball contents**

```bash
cd apps/cli
pnpm pack --dry-run
```

Expected: The output should list both `dist/cli.js` and `skills/banana-cli/SKILL.md`.

**Step 3: Commit**

```bash
git add apps/cli/package.json
git commit -m "chore(cli): include skills directory in npm package"
```

---

### Task 4: Update README with agent integration section

**Files:**

- Modify: `apps/cli/README.md` (add section before License)

**Step 1: Add Agent Skill section**

Add before the `## License` section:

````markdown
## Agent Skill

This package includes an [Agent Skills](https://agentskills.io) spec-compliant skill file that teaches AI agents how to use the CLI.

### Discover the skill path

```bash
banana install-skill
# Returns: {"skill_path": "/path/to/skills/banana-cli", ...}
```
````

### Install for your agent

Copy the skill directory to your agent's skills location:

```bash
# OpenCode
cp -r "$(banana install-skill | jq -r .skill_path)" .agents/skills/banana-cli

# Claude Code
cp -r "$(banana install-skill | jq -r .skill_path)" ~/.claude/skills/banana-cli

# Cursor
cp -r "$(banana install-skill | jq -r .skill_path)" .cursor/skills/banana-cli
```

````

**Step 2: Bump version to 0.1.3**

In `package.json`, change `"version": "0.1.2"` to `"version": "0.1.3"`.

Also update the `metadata.version` in `skills/banana-cli/SKILL.md` to `"0.1.3"`.

**Step 3: Commit**

```bash
git add apps/cli/README.md apps/cli/package.json apps/cli/skills/banana-cli/SKILL.md
git commit -m "docs(cli): add agent skill installation instructions, bump to 0.1.3"
````

---

### Task 5: Build, publish, and verify

**Step 1: Build**

```bash
cd apps/cli
pnpm build
```

**Step 2: Verify install-skill works with built output**

```bash
node dist/cli.js install-skill
```

Expected: JSON with valid `skill_path`.

**Step 3: Verify skill file is in tarball**

```bash
pnpm pack --dry-run
```

Expected: `skills/banana-cli/SKILL.md` is listed.

**Step 4: Publish**

```bash
npm publish
```

Expected: `+ @banananasplitz/cli@0.1.3`

**Step 5: Verify with npx**

Wait ~2 minutes for CDN propagation, then:

```bash
npx @banananasplitz/cli@0.1.3 install-skill
```

Expected: JSON with skill path.

**Step 6: Commit any remaining changes and tag**

```bash
git tag -a "@banananasplitz/cli@0.1.3" -m "feat: add Agent Skills spec skill file and install-skill command"
git push origin --tags
```
