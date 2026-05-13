import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyBalancesAcrossChatsHandler } from "./getMyBalancesAcrossChats.js";
import {
  CURRENCY_DATABASE,
  fetchExchangeRates,
} from "../../utils/currencyApi.js";
import { convertNativeToBase } from "../../utils/currencyConversion.js";
import { hasUserStartedBot } from "../../utils/hasUserStartedBot.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";

const inputSchema = z.object({
  baseCurrency: z
    .string()
    .toUpperCase()
    .refine((c) => c in CURRENCY_DATABASE, { message: "Unknown baseCurrency" })
    .optional(),
});

const outputSchema = z.object({
  baseCurrency: z.string(),
  ratesAsOf: z.date().nullable(),
  counterparties: z.array(
    z.object({
      userId: z.number(),
      firstName: z.string(),
      lastName: z.string().nullable(),
      hasStartedBot: z.boolean(),
      totalBaseNet: z.number(),
      groups: z.array(
        z.object({
          chatId: z.number(),
          chatTitle: z.string(),
          currency: z.string(),
          nativeNet: z.number(),
          baseNet: z.number(),
        })
      ),
    })
  ),
});

type Output = z.infer<typeof outputSchema>;

// Dependency-injection seam keeps the handler unit-testable without
// touching the network. Production passes the real fetch + handler.
export interface Deps {
  getAcrossChats: typeof getMyBalancesAcrossChatsHandler;
  fetchRates: (base: string) => Promise<Record<string, number>>;
}

const defaultDeps: Deps = {
  getAcrossChats: getMyBalancesAcrossChatsHandler,
  fetchRates: async (base) => (await fetchExchangeRates(base)).rates,
};

export async function getMyCounterpartyBalancesHandler(
  args: { callerId: number; baseCurrency?: string },
  db: Db,
  deps: Deps = defaultDeps
): Promise<Output> {
  // Resolve base currency: explicit > stored > "SGD"
  let baseCurrency = args.baseCurrency;
  if (!baseCurrency) {
    const u = await db.user.findUnique({
      where: { id: BigInt(args.callerId) },
      select: { baseCurrency: true },
    });
    baseCurrency = u?.baseCurrency ?? "SGD";
  }

  const acrossChats = await deps.getAcrossChats(args.callerId, db);
  if (acrossChats.balances.length === 0) {
    return { baseCurrency, ratesAsOf: null, counterparties: [] };
  }

  // Fetch rates with USD as the API base; we cross-pivot in memory.
  const rates = await deps.fetchRates("USD");
  const ratesAsOf = new Date();

  // Group by counterparty userId
  type Bucket = {
    chatId: number;
    chatTitle: string;
    currency: string;
    nativeNet: number;
    baseNet: number;
  };
  const byUser = new Map<number, { groups: Bucket[]; total: number }>();

  for (const chat of acrossChats.balances) {
    for (const cp of chat.counterparties) {
      const baseNet = convertNativeToBase(
        cp.net,
        cp.currency,
        baseCurrency,
        rates
      );
      if (baseNet === null) continue; // skip unknown currency rather than failing the whole view
      const entry = byUser.get(cp.userId) ?? { groups: [], total: 0 };
      entry.groups.push({
        chatId: chat.chatId,
        chatTitle: chat.chatTitle,
        currency: cp.currency,
        nativeNet: cp.net,
        baseNet,
      });
      entry.total += baseNet;
      byUser.set(cp.userId, entry);
    }
  }

  // Filter out near-zero totals
  for (const [uid, entry] of byUser) {
    if (Math.abs(entry.total) <= FINANCIAL_THRESHOLDS.DISPLAY)
      byUser.delete(uid);
  }

  if (byUser.size === 0) {
    return { baseCurrency, ratesAsOf, counterparties: [] };
  }

  const userIds = Array.from(byUser.keys());
  const users = await db.user.findMany({
    where: { id: { in: userIds.map((n) => BigInt(n)) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const userMap = new Map(users.map((u) => [Number(u.id), u]));

  // Resolve hasStartedBot in parallel
  const hasBotPairs = await Promise.all(
    userIds.map(async (uid) => [uid, await hasUserStartedBot(uid, db)] as const)
  );
  const hasBotMap = new Map(hasBotPairs);

  // Drop any uid that has no matching User row (deleted between the
  // cross-chat fetch and findMany). Settle/nudge downstream would otherwise
  // try to write against a non-existent userId.
  const counterparties: Output["counterparties"] = userIds
    .flatMap((uid) => {
      const u = userMap.get(uid);
      if (!u) return [];
      const entry = byUser.get(uid)!;
      return [
        {
          userId: uid,
          firstName: u.firstName,
          lastName: u.lastName,
          hasStartedBot: hasBotMap.get(uid) ?? false,
          totalBaseNet: entry.total,
          groups: entry.groups,
        },
      ];
    })
    .sort((a, b) => Math.abs(b.totalBaseNet) - Math.abs(a.totalBaseNet));

  return { baseCurrency, ratesAsOf, counterparties };
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ ctx, input }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    return getMyCounterpartyBalancesHandler(
      {
        callerId: Number(ctx.session.user.id),
        baseCurrency: input.baseCurrency,
      },
      ctx.db
    );
  });
