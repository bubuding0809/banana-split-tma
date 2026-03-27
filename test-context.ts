import { BotContext } from "./apps/bot/src/types.js";

const ctx = {
  chat: { type: "supergroup", id: -123 },
  me: { id: 999, username: "BotName" },
  message: {
    text: "Hello @BotName",
    entities: [{ type: "mention", offset: 6, length: 8 }],
  },
} as any;

const botUsername = ctx.me.username;
const text = ctx.message.text || ctx.message.caption || "";
const entities = ctx.message.entities || ctx.message.caption_entities || [];

const hasMentionEntity = entities.some(
  (entity: any) =>
    entity.type === "mention" &&
    text
      .substring(entity.offset, entity.offset + entity.length)
      .toLowerCase() === `@${botUsername.toLowerCase()}`
);

const mentionRegex = new RegExp(`@${botUsername}\\b`, "i");
const isMentioned = hasMentionEntity || mentionRegex.test(text);

console.log("hasMentionEntity:", hasMentionEntity);
console.log("isMentioned:", isMentioned);
