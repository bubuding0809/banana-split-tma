const fs = require("fs");

let file = "packages/trpc/src/routers/chat/migrateChat.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  `    if (existingNewChat) {
      throw new TRPCError({
        code: "CONFLICT",
        message: \`Chat with ID \${newChatId} already exists\`,
      });
    }`,
  `    if (existingNewChat) {
      return {
        message: \`Chat \${newChatId} already exists, skipping migration.\`
      };
    }`
);

fs.writeFileSync(file, content);
