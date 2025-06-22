import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";

import type { AppRouter } from "./root.js";
import { appRouter } from "./root.js";
import { withCreateTRPCContext } from "./trpc.js";

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

export { appRouter, trpcExpress, withCreateTRPCContext };
export type { AppRouter, RouterInputs, RouterOutputs };
