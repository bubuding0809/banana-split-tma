const fs = require("fs");

let file = "packages/trpc/src/routers/chat/migrateChat.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  `    if (existingNewChat) {
      return {
        message: \`Chat \${newChatId} already exists, skipping migration.\`
      };
    }`,
  `    if (existingNewChat) {
      return {
        status: 200,
        message: \`Chat \${newChatId} already exists, skipping migration.\`,
        migratedRecords: {
          expenses: 0,
          settlements: 0,
          snapshots: 0,
          schedules: 0,
        }
      };
    }`
);

fs.writeFileSync(file, content);
