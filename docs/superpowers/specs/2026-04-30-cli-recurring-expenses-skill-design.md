# CLI Recurring Expenses Spec

## Summary
Update the CLI agent skill documentation (`SKILL.md`) to reflect the new recurring expense commands and parameters, ensuring AI agents are aware of and can properly use the recurrence features.

## Problem/Background
The CLI is being enhanced to support recurring expenses (both creation and lifecycle management). The `banana-cli` agent skill acts as the primary instruction manual for any agent interacting with the CLI. Without updating this skill document, agents will not know these commands exist or how to properly format the new recurrence flags.

## Solution
We will update `apps/cli/skills/banana-cli/SKILL.md` to:

### 1. Update `Command Reference` Table
- Add the new recurrence flags (`--recurrence-*`) to the `create-expense` entry.
- Add new rows for the four new commands:
  - `list-recurring-expenses`: Lists active templates.
  - `get-recurring-expense`: Fetches template details via `--template-id`.
  - `update-recurring-expense`: Modifies template schedule/amount via `--template-id`.
  - `cancel-recurring-expense`: Cancels a template via `--template-id`.

### 2. Update `Common Mistakes`
- Add a note emphasizing that `cancel-recurring-expense` only stops *future* recurrences, leaving previously generated expenses intact.
- Add a note clarifying the difference between an `expenseId` and a `templateId`.

### 3. Add a New Workflow: `Manage a Subscription`
Add a new subsection under `Workflows` showing how an agent might create and then update a recurring expense.
```bash
# 1. Create a monthly subscription
banana create-expense \
  --description "Spotify" \
  --amount 15.90 \
  --payer-id <payer_user_id> \
  --split-mode EQUAL \
  --participant-ids <id1>,<id2> \
  --recurrence-frequency MONTHLY

# 2. Check the active recurring templates
banana list-recurring-expenses

# 3. Increase the price of the subscription
banana update-recurring-expense \
  --template-id <uuid> \
  --amount 16.90
```

## Impact
✅ **Positive:**
- Agents will autonomously discover and correctly utilize recurring expense features.
- Prevents hallucination of syntax (e.g. agents trying to pass `--recurring true`).

✅ **Risk Assessment:**
- **Zero technical risk**: This is purely a documentation update.

## Testing
- [ ] Read the updated `SKILL.md` file to ensure markdown table formatting is not broken.
- [ ] Verify that all new flags and commands accurately match the actual CLI implementation plan.