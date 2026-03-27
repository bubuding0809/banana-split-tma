const fs = require("fs");
const file = "apps/bot/src/features/group.ts";
let code = fs.readFileSync(file, "utf8");

const target = `  // Case-insensitive check for bot mention
  const mentionRegex = new RegExp(\`@\${botUsername}\`, "i");
  const isMentioned = mentionRegex.test(text);

  // Check if it's a direct reply to one of the bot's messages
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;

  if (isMentioned || isReplyToBot) {
    // Strip all mentions of the bot (case-insensitive, global) to get the actual command payload
    const payload = text.replace(new RegExp(\`@\${botUsername}\`, "gi"), "").trim();`;

const replacement = `  // Case-insensitive check for bot mention, ensuring word boundary
  const mentionRegex = new RegExp(\`@\${botUsername}\\\\b\`, "i");
  const isMentioned = mentionRegex.test(text);

  // Check if it's a direct reply to one of the bot's messages
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;

  if (isMentioned || isReplyToBot) {
    // Strip all mentions of the bot (case-insensitive, global) to get the actual command payload
    const payload = text.replace(new RegExp(\`@\${botUsername}\\\\b\`, "gi"), "").trim();`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
console.log("patched with boundaries");
