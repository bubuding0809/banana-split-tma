import { BotContext } from "../types.js";
import { bananaAgent } from "@repo/agent";
import { RequestContext } from "@mastra/core/request-context";

export const handleAgentMessage = async (ctx: BotContext, text?: string) => {
  const userMessage = text || ctx.message?.text;
  if (!userMessage || !ctx.chat || !ctx.from) return;

  const thinkingMsg = await ctx.reply("Thinking...");

  try {
    const requestContext = new RequestContext<{
      telegramUserId: number;
      chatId: number;
    }>();
    requestContext.set("telegramUserId", ctx.from.id);
    requestContext.set("chatId", ctx.chat.id);

    const streamInfo = await bananaAgent.stream(userMessage, {
      memory: {
        thread: String(ctx.chat.id),
        resource: `telegram-user-${ctx.from.id}`,
      },
      requestContext,
    });

    let fullText = "";
    let lastUpdatedText = "";
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 1500;

    for await (const chunk of streamInfo.textStream) {
      fullText += chunk;

      const now = Date.now();
      if (
        now - lastUpdateTime >= UPDATE_INTERVAL &&
        fullText !== lastUpdatedText
      ) {
        lastUpdateTime = now;
        lastUpdatedText = fullText;
        await ctx.api
          .editMessageText(
            ctx.chat.id,
            thinkingMsg.message_id,
            fullText || "Thinking..."
          )
          .catch((e) => console.error("Edit message error (throttle):", e));
      }
    }

    if (fullText !== lastUpdatedText) {
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          thinkingMsg.message_id,
          fullText || "I couldn't generate a response."
        )
        .catch((e) => console.error("Edit message error (final):", e));
    }
  } catch (error) {
    console.error("Agent error:", error);
    await ctx.api
      .editMessageText(
        ctx.chat.id,
        thinkingMsg.message_id,
        "Sorry, I encountered an error while processing your request."
      )
      .catch(() => {});
  }
};
