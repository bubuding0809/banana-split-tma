# BananaSplitz Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Groups command — browse personal, active, and settled groups; split-panel detail showing your balance and recent expenses
- People command — cross-group counterparty balances with per-group breakdown, Settle All, and Nudge actions
- `@bananasplitz` AI integration with 35 tools at full CLI parity:
  - Cross-group balances and spending (list-my-balances, list-my-spending, list-counterparty-balances, settle-all-with)
  - Chat and group management (list-chats, get-chat, update-chat-settings)
  - Expense CRUD with automatic split calculation (list-expenses, get-expense, create-expense, update-expense, delete-expense)
  - Debt views (get-debts, get-simplified-debts, get-net-share, get-totals)
  - Settlements (list-settlements, create-settlement, delete-settlement, settle-all-debts)
  - Expense snapshots (list/get/create/update/delete-snapshot)
  - Recurring expense templates (list/get/update/cancel-recurring-expense)
  - Telegram reminders (send-group-reminder, send-debt-reminder)
  - Categories, exchange rates, and bulk import/update
- Raycast confirmation prompts on every mutating tool
- Extension preferences for API key (required) and self-hosted API URL (optional)
