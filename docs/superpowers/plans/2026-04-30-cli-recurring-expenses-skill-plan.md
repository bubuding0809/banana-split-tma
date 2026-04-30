# CLI Skill Documentation Update Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the `banana-cli` SKILL.md file to document the new recurring expense commands and `create-expense` flags so agents can use them autonomously.

**Architecture:** Modifies `apps/cli/skills/banana-cli/SKILL.md` inline to update the command reference table, common mistakes section, and add a new workflow example.

**Tech Stack:** Markdown

---

### Task 1: Update Command Reference Table

**Files:**
- Modify: `apps/cli/skills/banana-cli/SKILL.md`

- [ ] **Step 1: Update the `create-expense` row in the table**

Find the `create-expense` row and append the recurrence flags to the "Key Flags" column:
`... --custom-splits`, `--date`, `--category`, `--recurrence-frequency`, `--recurrence-interval`, `--recurrence-weekdays`, `--recurrence-end-date`, `--recurrence-timezone`

- [ ] **Step 2: Add rows for the 4 new commands**

Add these rows immediately below `update-expense`:
```markdown
| `list-recurring-expenses` | `--chat-id`                                                                                                                                                                         | List active recurring expense templates                                                                                                                                                                                                  |
| `get-recurring-expense`   | `--template-id` (required)                                                                                                                                                          | Full details of a recurring template                                                                                                                                                                                                     |
| `update-recurring-expense`| `--template-id` (required); `--amount`, `--description`, `--frequency`, `--interval`, `--weekdays`, `--end-date`                                                                    | Update the schedule or locked details of an active template                                                                                                                                                                              |
| `cancel-recurring-expense`| `--template-id` (required)                                                                                                                                                          | Cancel an active recurring template                                                                                                                                                                                                      |
```

---

### Task 2: Add Common Mistakes and Workflows

**Files:**
- Modify: `apps/cli/skills/banana-cli/SKILL.md`

- [ ] **Step 1: Add to Common Mistakes**

Append to the numbered list under `## Common Mistakes`:
```markdown
9. **Confusing `expenseId` and `templateId`** — recurring management commands take a `--template-id`, while normal expense commands take an `--expense-id`.
10. **Trying to delete past recurrences via `cancel-recurring-expense`** — cancelling a template only stops *future* runs; previously generated expenses remain intact.
```

- [ ] **Step 2: Add Manage a Subscription Workflow**

Append to the bottom of the `## Workflows` section:
```markdown
### Manage a Subscription

Create a recurring expense and update it later.

```bash
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
```
``` (Note: ensure proper markdown code block escaping in the actual file)

- [ ] **Step 3: Commit the changes**

```bash
git add apps/cli/skills/banana-cli/SKILL.md
git commit -m "docs: update banana-cli skill with recurring expense commands" --no-verify
```