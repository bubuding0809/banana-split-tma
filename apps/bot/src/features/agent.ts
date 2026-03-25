import { BotContext } from "../types.js";
import { bananaAgent } from "@repo/agent";

export const handleAgentMessage = async (ctx: BotContext) => {
  if (!ctx.message?.text || !ctx.chat || !ctx.from) return;
  const userMessage = ctx.message.text;

  const thinkingMsg = await ctx.reply("Thinking...");

  try {
    const options: any = {
      memory: {
        thread: String(ctx.chat.id),
        resource: `telegram-user-${ctx.from.id}`,
      },
      requestContext: {
        telegramUserId: ctx.from.id,
        chatId: ctx.chat.id,
      },
    };
    const streamInfo = await bananaAgent.stream(userMessage, options);

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
