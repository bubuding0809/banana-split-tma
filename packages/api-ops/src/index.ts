export { ApiValidationError, missingField, invalidField } from "./errors.js";
export type { ApiValidationErrorCode } from "./errors.js";

export {
  MONTH_RE,
  requireField,
  parseNumber,
  parsePositiveNumber,
  parseCommaSeparatedNumbers,
  parseJsonArray,
  parseBooleanField,
} from "./parse.js";

export {
  applyExpensePartialUpdate,
  type ExpenseSplitMode,
  type ExpenseUpdatePatch,
} from "./helpers/expense-update.js";

export {
  listChats,
  getChat,
  getDebts,
  getSimplifiedDebts,
  updateChatSettings,
  parseExcludeTypes,
  parseCurrencies,
  parseBooleanOption,
} from "./ops/chat.js";

export {
  listMyBalances,
  listMySpending,
  listCounterpartyBalances,
  settleAllWith,
  parseCounterpartyUserId,
} from "./ops/me.js";

export { listCategories } from "./ops/category.js";

export {
  listExpenses,
  getExpense,
  validateExpenseId,
  createExpense,
  parseCreateExpenseInput,
  updateExpense,
  parseUpdateExpensePatch,
  getNetShare,
  getTotals,
  deleteExpense,
  bulkImportExpenses,
  bulkUpdateExpenses,
  type ExpenseRow,
  type BulkUpdateRow,
  type CreateExpenseInput,
} from "./ops/expense.js";

export {
  listSettlements,
  createSettlement,
  deleteSettlement,
  settleAllDebts,
  validateCreateSettlementInput,
  validateSettleAllDebtsInput,
  validateSettlementId,
} from "./ops/settlement.js";

export {
  listSnapshots,
  getSnapshot,
  createSnapshot,
  updateSnapshot,
  deleteSnapshot,
  validateSnapshotId,
  validateCreateSnapshotInput,
  validateUpdateSnapshotInput,
} from "./ops/snapshot.js";

export {
  listRecurringExpenses,
  getRecurringExpense,
  updateRecurringExpense,
  cancelRecurringExpense,
  validateTemplateId,
  buildRecurringUpdatePayload,
} from "./ops/recurring.js";

export {
  sendGroupReminder,
  sendDebtReminder,
  validateSendDebtReminderInput,
} from "./ops/reminder.js";

export { getExchangeRate } from "./ops/currency.js";
