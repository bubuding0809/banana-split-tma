# Telegram Bot Migration Parity Checklist

## Completed Verification

- [x] **User Commands**: `/start`, `/help`, `/cancel` (100% parity achieved, improvements in message editing).
- [x] **Group Commands**: `/pin`, `/set_topic` (100% parity achieved).
- [x] **Expense Commands**: `/balance` (Upgraded from mock to real logic), `/summary` (100%), `/stats` (100%).
- [x] **Bot Events**: `my_chat_member`, `message:migrate_to_chat_id` (100% parity with error handling improvements).
- [x] **Member Management**: `/chase` (100% parity achieved).

## Pending Implementation (Missing Parity)

- [ ] **Private Expense Creation**:
  - Implement plain text parsing for logging expenses via direct message (Amount, Currency, Date, Description).
  - Implement `undo_expense:<id>` callback query to quickly delete the just-logged personal expense.
- [ ] **Member Management**:
  - Implement `/start ADD_MEMBER<group_id>` deep link logic.
  - Implement `message:users_shared` listener handling for `request_id === 1` to process the added members via the backend.
- [ ] **List Command Refinements**:
  - Add the "Overall Total" per currency summary block at the bottom of the `/list` command output.
- [ ] **Technical Debt**:
  - Refactor the duplicated `getPeriodRange` logic found in both `expenses.ts` and `stats.ts` into a shared utility file.
