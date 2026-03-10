# @banananasplitz/cli

Agent-first CLI for the [Banana Split](https://github.com/bubuding0809/banana-split-tma) expense tracking API. Designed for AI agents (OpenCode, Claude Code, Cursor, etc.) to interact with Banana Split data by shelling out and parsing JSON output.

## Install

```bash
# Run directly with npx (no install needed)
npx @banananasplitz/cli help

# Or install globally
npm install -g @banananasplitz/cli
banana help
```

## Authentication

Get an API key from the Banana Split Telegram bot, then configure it:

```bash
# Option 1: Save to config file (~/.bananasplit.json)
banana login --api-key <your-key>

# Option 2: Environment variable
export BANANA_SPLIT_API_KEY=<your-key>

# Option 3: Pass directly
banana get-chat --api-key <your-key>
```

Resolution order: `--api-key` flag > `BANANA_SPLIT_API_KEY` env > `~/.bananasplit.json`

## Usage

All output is JSON to stdout. Errors are JSON to stderr with exit code 1.

```bash
# List chats
banana list-chats

# Get chat details (auto-scoped with chat-scoped API keys)
banana get-chat

# Get debts
banana get-debts --currency SGD

# Get simplified debts
banana get-simplified-debts --currency SGD

# List expenses
banana list-expenses
banana list-expenses --currency USD

# Get expense details
banana get-expense --expense-id <uuid>

# Create an expense (split equally)
banana create-expense \
  --description "Dinner" \
  --amount 120 \
  --payer-id 123456 \
  --split-mode EQUAL \
  --participant-ids 123456,789012,345678

# Get balance between two users
banana get-net-share --main-user-id 123 --target-user-id 456 --currency SGD

# Get totals for a user
banana get-totals --user-id 123456

# List/create settlements
banana list-settlements
banana create-settlement --sender-id 123 --receiver-id 456 --amount 50 --currency SGD

# Snapshots
banana list-snapshots
banana get-snapshot --snapshot-id <uuid>

# Exchange rates
banana get-exchange-rate --base-currency USD --target-currency SGD

# Update chat settings
banana update-chat-settings --debt-simplification true --base-currency SGD
```

## Commands

| Command                | Description                            |
| ---------------------- | -------------------------------------- |
| `help`                 | Show available commands and options    |
| `login`                | Save API key to config file            |
| `install-skill`        | Print path to bundled Agent Skill      |
| `list-chats`           | List all expense-tracking chats/groups |
| `get-chat`             | Get chat details and members           |
| `get-debts`            | Get outstanding debts                  |
| `get-simplified-debts` | Get optimized debt graph               |
| `update-chat-settings` | Update chat configuration              |
| `list-expenses`        | List expenses in a chat                |
| `get-expense`          | Get expense details                    |
| `create-expense`       | Create a new expense                   |
| `get-net-share`        | Get balance between two users          |
| `get-totals`           | Get total borrowed/lent for a user     |
| `list-settlements`     | List debt settlements                  |
| `create-settlement`    | Record a payment                       |
| `list-snapshots`       | List expense snapshots                 |
| `get-snapshot`         | Get snapshot details                   |
| `get-exchange-rate`    | Get currency exchange rate             |

## For AI Agents

This CLI is designed for programmatic use. Every command outputs structured JSON:

```bash
# Success: JSON to stdout, exit code 0
banana get-exchange-rate --base-currency USD --target-currency SGD
# {"rate":1.27255022,"base":"USD","target":"SGD"}

# Error: JSON to stderr, exit code 1
banana get-chat
# {"error":"auth_error","message":"No API key found..."}
```

Run `banana help` to get a machine-readable JSON schema of all commands and their options.

## Agent Skill

This package includes an [Agent Skills](https://agentskills.io) spec-compliant skill file that teaches AI agents how to use the CLI.

### Discover the skill path

```bash
banana install-skill
# Returns: {"skill_path": "/path/to/skills/banana-cli", ...}
```

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

## License

MIT
