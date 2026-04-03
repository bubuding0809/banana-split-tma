import { BotContext } from "../types.js";
import { bananaAgent } from "@repo/agent";
import { RequestContext } from "@mastra/core/request-context";
import { Composer } from "grammy";
import { renderTelegramHtml } from "../utils/telegramMarkdown.js";
import { splitTelegramHtmlChunks } from "../utils/chunkHtml.js";

export const agentFeature = new Composer<BotContext>();

export const handleAgentMessage = async (ctx: BotContext, text?: string) => {
  let userMessage = text || ctx.message?.text || ctx.message?.caption;
  // If we just sent an image with no caption but it's a direct ping, default to a generic text
  if (!userMessage && ctx.message?.photo) {
    userMessage = "Here is an image.";
  }
  if (!userMessage || !ctx.chat || !ctx.from) return;

  // Keep a reference to the raw text to preserve @mentions in their original form
  const rawText = ctx.message?.text || ctx.message?.caption || userMessage;

  // Pre-process any mentions to give the LLM explicit User IDs
  const entities = ctx.message?.entities || ctx.message?.caption_entities || [];
  if (entities.length > 0) {
    const extraMentions: string[] = [];

    for (const entity of entities) {
      if (entity.type === "text_mention" && "user" in entity) {
        const name = rawText.substring(
          entity.offset,
          entity.offset + entity.length
        );
        extraMentions.push(`"${name}" is Telegram User ID ${entity.user.id}`);
      }
    }

    if (extraMentions.length > 0) {
      userMessage += `\n\n[System Note: In the user's message, ${extraMentions.join(", ")}]`;
    }
  }

  // React with thinking emoji and send typing indicator
  await ctx.react("🤔").catch(() => {});
  await ctx.api.sendChatAction(ctx.chat.id, "typing").catch(() => {});

  let replyMsg: { message_id: number } | null = null;
  let fullText = "";

  try {
    let finalMessagePayload: any = userMessage;

    // Check if there is an image in the message
    if (ctx.message?.photo && ctx.message.photo.length > 0) {
      // Get the highest resolution photo (last element in the array)
      const photoArray = ctx.message.photo;
      const photo = photoArray[photoArray.length - 1];
      if (photo) {
        const file = await ctx.api.getFile(photo.file_id);

        if (file.file_path) {
          const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

          // Download image and convert to base64 to avoid URL accessibility issues
          // Mastra would otherwise try to download the URL for memory storage
          try {
            const response = await fetch(fileUrl);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              const base64 = Buffer.from(uint8Array).toString("base64");
              // Detect mime type from file_id extension or default to jpeg
              const mimeType = photo.file_id.includes("/")
                ? "image/jpeg"
                : "image/jpeg";
              const dataUrl = `data:${mimeType};base64,${base64}`;

              finalMessagePayload = [
                {
                  role: "user",
                  content: [
                    { type: "text", text: userMessage },
                    { type: "image", image: dataUrl },
                  ],
                },
              ];
            }
          } catch {
            // If download fails, fall through to text-only message
          }
        }
      }
    }

    const requestContext = new RequestContext<{
      telegramUserId: number;
      chatId: number;
    }>();
    requestContext.set("telegramUserId", ctx.from.id);
    requestContext.set("chatId", ctx.chat.id);

    const userName = [ctx.from.first_name, ctx.from.last_name]
      .filter(Boolean)
      .join(" ");
    const userRef = ctx.from.username
      ? `${userName} (@${ctx.from.username})`
      : userName;
    const chatType = ctx.chat.type === "private" ? "private DM" : "group chat";

    // Inject the current date and time so the agent can resolve relative temporal queries (e.g., "yesterday", "this week")
    const nowTimestamp = new Date().toLocaleString("en-US", {
      timeZone: "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const systemPrompt = `The current date and time is ${nowTimestamp}.
The current user talking to you is ${userRef} (Telegram ID: ${ctx.from.id}). You are currently in a ${chatType} (Chat ID: ${ctx.chat.id}). 
If the user refers to themselves ("I", "me", "my", etc.), use their Telegram ID for any tool parameters requiring a User ID. 
If you need to resolve "@usernames" to User IDs, use the getChatDetailsTool to look up the members of this chat. Their usernames are stored WITHOUT the "@" symbol in the database (e.g. "last_sean" instead of "@last_sean").
If the user mentions someone by username who is NOT found in the chat details, gracefully inform them that the user must join the group or interact with the bot first before you can split expenses with them.
In a private DM, expenses are usually just for the user, so default the payer and participant to the current user unless specified otherwise.
IMPORTANT: When formatting tables, ALWAYS include the markdown table header separator row (e.g. |---|---|).
CRITICAL: When you mention or refer to any user in your text responses, NEVER output their raw numeric Telegram ID. ALWAYS use their @username (if available) so it is clickable. If they do not have a @username, format their name as a markdown link using \`[First Name](tg://user?id=TELEGRAM_ID)\` so they are still clickable.`;

    const streamInfo = await bananaAgent.stream(finalMessagePayload, {
      memory: {
        thread: String(ctx.chat.id),
        resource: `telegram-user-${ctx.from.id}`,
        options: {
          // Keep a healthy sliding window that leverages the new gemini-3.1-pro-preview 2m context
          // Minimax has a smaller limit (~2000 context limit for highspeed models), so we reduce it significantly.
          lastMessages: process.env.AGENT_PROVIDER === "minimax" ? 15 : 50,
        },
      },
      requestContext,
      system: systemPrompt,
      maxSteps: 10, // Increased to 10 to give ample room for complex tool chains and retries
      providerOptions: {
        google: {
          reasoningEffort: "low",
        },
      },
    });

    let lastUpdatedText = "";
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 1500;

    // Generate a non-zero random draft ID for Telegram streaming
    const draftId = Math.floor(Math.random() * 1000000000) + 1;

    const activeTools = new Set<string>();

    for await (const chunk of streamInfo.fullStream) {
      if (chunk.type === "text-delta") {
        fullText += chunk.payload.text;
      } else if (chunk.type === "tool-call-input-streaming-start") {
        activeTools.add(chunk.payload.toolName);
        console.log(`[Agent] 🛠️ Preparing tool: ${chunk.payload.toolName}`);
      } else if (chunk.type === "tool-call") {
        console.log(`[Agent] ⚙️ Executing tool: ${chunk.payload.toolName}`);
      } else if (chunk.type === "tool-result") {
        activeTools.delete(chunk.payload.toolName);
        console.log(`[Agent] ✅ Finished tool: ${chunk.payload.toolName}`);
      } else if (chunk.type === "tool-error") {
        activeTools.delete(chunk.payload.toolName);
        console.error(`[Agent] ❌ Tool error: ${chunk.payload.toolName}`);
      }

      const now = Date.now();

      // Update if interval passed, or if we just called/finished a tool (to update the draft UI immediately)
      const isToolEvent =
        chunk.type === "tool-call-input-streaming-start" ||
        chunk.type === "tool-result" ||
        chunk.type === "tool-error";

      if (
        (now - lastUpdateTime >= UPDATE_INTERVAL || isToolEvent) &&
        fullText.length < 4000 // Don't stream drafts that exceed telegram's single message limit
      ) {
        lastUpdateTime = now;
        lastUpdatedText = fullText;
        let sanitizedText = renderTelegramHtml(fullText);

        if (activeTools.size > 0) {
          const tools = Array.from(activeTools).join(", ");
          const toolIndicator = `<i>🛠️ Calling: ${tools}...</i>`;
          sanitizedText =
            sanitizedText.trim().length > 0
              ? `${sanitizedText}\n\n${toolIndicator}`
              : toolIndicator;
        }

        // Try the new Telegram native streaming API
        if (sanitizedText.trim().length > 0) {
          if (ctx.chat.type === "private") {
            // Native draft streaming is only supported in private chats
            await ctx.api
              .sendMessageDraft(ctx.chat.id, draftId, sanitizedText, {
                parse_mode: "HTML",
              })
              .catch((e) =>
                console.error("Edit message error (draft throttle):", e)
              );
          } else {
            // Use standard message editing for group chats
            if (!replyMsg) {
              replyMsg = await ctx
                .reply(sanitizedText, { parse_mode: "HTML" })
                .catch((e) => {
                  console.error("Send initial group message error:", e);
                  return null;
                });
            } else {
              await ctx.api
                .editMessageText(
                  ctx.chat.id,
                  replyMsg.message_id,
                  sanitizedText,
                  {
                    parse_mode: "HTML",
                  }
                )
                .catch((e) => console.error("Edit group message error:", e));
            }
          }
        }
      }
    }

    if (fullText) {
      const finalMsg = fullText.trim()
        ? renderTelegramHtml(fullText)
        : "I couldn't generate a response.";

      // Check if message is too long, we need to chunk it
      if (finalMsg.length > 4000) {
        if (ctx.chat.type === "private") {
          // Clear the draft manually since we are breaking it up into multiple standard messages
          await ctx.api
            .sendMessageDraft(ctx.chat.id, draftId, "")
            .catch(() => {});
        } else if (replyMsg) {
          // Delete the streaming message so we can resend it cleanly in chunks
          await ctx.api
            .deleteMessage(ctx.chat.id, replyMsg.message_id)
            .catch(() => {});
        }

        // Intelligent chunking that respects paragraph and line breaks
        const chunks = splitTelegramHtmlChunks(finalMsg, 4000);

        // Send chunks sequentially
        for (const chunk of chunks) {
          if (chunk.trim()) {
            await ctx.reply(chunk, { parse_mode: "HTML" }).catch(() => {});
          }
        }
      } else {
        if (ctx.chat.type === "private") {
          // Clear the draft manually before sending the final message
          await ctx.api
            .sendMessageDraft(ctx.chat.id, draftId, "")
            .catch(() => {});

          // Send the final completed message
          await ctx
            .reply(finalMsg, { parse_mode: "HTML" })
            .catch((e) =>
              console.error("Edit message error (final reply):", e)
            );
        } else {
          // Edit the group message to the final state
          if (replyMsg) {
            await ctx.api
              .editMessageText(ctx.chat.id, replyMsg.message_id, finalMsg, {
                parse_mode: "HTML",
              })
              .catch((e) =>
                console.error("Edit final group message error:", e)
              );
          } else {
            // Fallback if no initial streaming message was sent
            await ctx
              .reply(finalMsg, { parse_mode: "HTML" })
              .catch((e) =>
                console.error("Send final group message error:", e)
              );
          }
        }
      }
    }
  } catch (error) {
    console.error("Agent error:", error);
    await ctx
      .reply("Sorry, I encountered an error while processing your request.")
      .catch(() => {});
  }
};

agentFeature.command(["ask", "do"], async (ctx) => {
  const text = ctx.match;
  if (!text && !ctx.message?.photo) return;

  await handleAgentMessage(ctx, text?.trim() || "");
});

// Automatically process ALL images sent in private chats without requiring /ask
// Also process direct replies to the bot's own messages in private chats
agentFeature.on(["message:photo", "message:text"], async (ctx, next) => {
  if (ctx.chat.type !== "private") return next();

  // If it's a text message, only intercept if it's a direct reply to the bot
  if (ctx.message.text && !ctx.message.photo) {
    const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
    if (!isReplyToBot) return next();
  }

  // If the text or caption explicitly starts with a command like /ask, let the command handler catch it.
  const textContent = ctx.message.text || ctx.message.caption || "";
  if (textContent.startsWith("/")) return next();

  await handleAgentMessage(ctx);
});
