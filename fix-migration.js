const fs = require("fs");

let file = "apps/bot/src/features/bot_events.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  `botEventsFeature.on("message:migrate_to_chat_id", async (ctx, next) => {`,
  `// In-memory set to store migrated chat IDs to avoid my_chat_member races
const migratedChatIds = new Set<number>();

botEventsFeature.on("message:migrate_to_chat_id", async (ctx, next) => {`
);

content = content.replace(
  `console.log(\`Bot added to group: \${chat.id}\`);

  try {
    let chatPhotoUrl = undefined;`,
  `// Wait briefly in case this is a migration race condition where message:migrate_to_chat_id 
  // hasn't arrived yet but we're getting the my_chat_member upgrade trigger
  if (chat.type === "supergroup") {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (migratedChatIds.has(chat.id)) {
        break;
      }
    }
  }

  // Skip chats that were just migrated to a supergroup
  if (migratedChatIds.has(chat.id)) {
    migratedChatIds.delete(chat.id);
    console.log(\`Skipping my_chat_member for migrated chat \${chat.id}\`);
    return next();
  }

  console.log(\`Bot added to group: \${chat.id}\`);

  try {
    let chatPhotoUrl = undefined;`
);

content = content.replace(
  `  try {
    await ctx.trpc.chat.migrateChat({
      oldChatId,
      newChatId,
    });`,
  `  try {
    migratedChatIds.add(newChatId);
    
    await ctx.trpc.chat.migrateChat({
      oldChatId,
      newChatId,
    });`
);

fs.writeFileSync(file, content);
