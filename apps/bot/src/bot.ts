import { Bot, session } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { createLogger, type Logger } from "@repo/logger";
import { env } from "./env.js";
import { BotContext, SessionData } from "./types.js";
import { trpcMiddleware } from "./middleware/trpc.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { reactionsMiddleware } from "./middleware/reactions.js";
import { userFeature } from "./features/user.js";
import { groupFeature } from "./features/group.js";
import { expensesFeature } from "./features/expenses.js";
import { statsFeature } from "./features/stats.js";
import { agentFeature } from "./features/agent.js";
import { botEventsFeature } from "./features/bot_events.js";
import { snapshotViewFeature } from "./features/snapshotView.js";

const botLog = createLogger("bot");

// With TELEGRAM_BOT_USERNAME set we can construct botInfo without calling
// getMe, which otherwise adds a Telegram round trip to every cold start.
// Handlers only read ctx.me.id and ctx.me.username; the capability flags are
// static for this bot and don't affect behaviour.
const staticBotInfo = ((): UserFromGetMe | undefined => {
  if (!env.TELEGRAM_BOT_USERNAME) return undefined;
  const id = Number(env.TELEGRAM_BOT_TOKEN.split(":")[0]);
  if (!Number.isFinite(id)) return undefined;
  return {
    id,
    is_bot: true,
    first_name: env.TELEGRAM_BOT_USERNAME,
    username: env.TELEGRAM_BOT_USERNAME,
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: true,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };
})();

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN, {
  botInfo: staticBotInfo,
});

function initial(): SessionData {
  return {};
}

bot.use(session({ initial }));

bot.use(loggerMiddleware);
// trpcMiddleware must run before reactionsMiddleware: reactions now consults
// the agent opt-in gate (isAgentAllowed), which needs ctx.trpc. The proxy it
// attaches is lazy/cheap to create, so this reorder is safe.
bot.use(trpcMiddleware);
bot.use(reactionsMiddleware);
bot.use(agentFeature);
bot.use(groupFeature);
bot.use(userFeature);
bot.use(expensesFeature);
bot.use(statsFeature);
bot.use(snapshotViewFeature);
bot.use(botEventsFeature);

// Catch-all for errors that bypass the logger middleware (e.g. thrown
// before bot.use(loggerMiddleware) ran). The middleware already logs
// bot.update.unhandled and rethrows, so when ctx.log is present we
// don't log again — preventing 2x event count for normal handler errors.
// A separate event name (bot.update.uncaught) makes the rare
// pre-middleware case clearly distinguishable in Axiom.
bot.catch((err) => {
  const log: Logger | undefined = (err.ctx as unknown as { log?: Logger }).log;
  if (log) return; // middleware already logged bot.update.unhandled
  botLog.error(
    {
      err: err.error,
      update_id: err.ctx.update.update_id,
      chat_id: err.ctx.chat?.id?.toString(),
    },
    "bot.update.uncaught"
  );
});
