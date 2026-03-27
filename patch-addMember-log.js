const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "packages",
  "trpc",
  "src",
  "routers",
  "chat",
  "addMember.ts"
);
let code = fs.readFileSync(file, "utf8");

const regexToReplace =
  /if \(ctx\.session\.parsedInitData\.chat_instance !== expectedInstance\) \{[\s\S]*?code: "FORBIDDEN",[\s\S]*?message:\s*"Unauthorized: You must open the Mini App from within the Telegram group\.",[\s\S]*?\}\);[\s\S]*?\}/m;

const replacement = `console.log("=== TMA DEBUG INFO ===");
      console.log("Expected Hash (start_param):", expectedInstance);
      console.log("Actual chat_instance from Telegram:", ctx.session.parsedInitData.chat_instance);
      console.log("start_param from Telegram:", ctx.session.parsedInitData.start_param);
      console.log("chat_type from Telegram:", ctx.session.parsedInitData.chat_type);
      console.log("chat object from Telegram:", ctx.session.parsedInitData?.chat);
      console.log("========================");`;

code = code.replace(regexToReplace, replacement);
fs.writeFileSync(file, code);
