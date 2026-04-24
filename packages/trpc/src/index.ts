import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";

import type { AppRouter } from "./root.js";
import { appRouter } from "./root.js";
import { withCreateTRPCContext } from "./trpc.js";
import { openApiDocument } from "./openapi.js";

/**
 * Inference helpers for input types
 * @example
 * type PostByIdInput = RouterInputs['post']['byId']
 *      ^? { id: number }
 **/
type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helpers for output types
 * @example
 * type AllPostsOutput = RouterOutputs['post']['all']
 *      ^? Post[]
 **/
type RouterOutputs = inferRouterOutputs<AppRouter>;

export { appRouter, trpcExpress, withCreateTRPCContext, openApiDocument };
export type { AppRouter, RouterInputs, RouterOutputs };

export { createBroadcast } from "./services/broadcast.js";
export type {
  BroadcastContext,
  BroadcastFailure,
  BroadcastMedia,
  BroadcastRecipient,
  BroadcastResult,
  BroadcastSuccess,
  CreateBroadcastOptions,
} from "./services/broadcast.js";

export { createExpenseHandler } from "./routers/expense/createExpense.js";
export { formatRecurrenceSummary } from "./routers/aws/utils/recurrenceSummary.js";
export type { RecurrenceSummaryInput } from "./routers/aws/utils/recurrenceSummary.js";
export {
  signRecurringExpensePayload,
  verifyRecurringExpenseSignature,
  buildRecurringExpenseScheduleName,
  RECURRING_EXPENSE_SCHEDULE_GROUP,
} from "./routers/aws/utils/recurringExpenseScheduler.js";

export * from "./utils/deepLinkProtocol.js";

export type DeliveryStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "RETRACTED"
  | "EDITED";
