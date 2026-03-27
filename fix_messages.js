const fs = require("fs");
let code = fs.readFileSync("apps/bot/src/features/messages.ts", "utf8");

code = code.replace(
  "export const BotMessages = {",
  `export const BotMessages = {
  ADD_MEMBER_SELECT_BUTTON: "👤 Select user(s)",
  ADD_MEMBER_CANCEL_BUTTON: "❌ Cancel",
  ADD_MEMBER_START_MESSAGE: "Please select members to add to *{group_title}*\\\\.",
  ADD_MEMBER_END_MESSAGE: "Added: {success_list}\\\\nFailed: {failed_list}",`
);

fs.writeFileSync("apps/bot/src/features/messages.ts", code);
