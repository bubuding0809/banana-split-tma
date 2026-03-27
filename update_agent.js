const fs = require("fs");
const path = require("path");

const agentPath = path.join(__dirname, "apps/bot/src/features/agent.ts");
let content = fs.readFileSync(agentPath, "utf-8");

const replacement = `    const requestContext = new RequestContext<{
      telegramUserId: number;
      chatId: number;
    }>();
    requestContext.set("telegramUserId", ctx.from.id);
    requestContext.set("chatId", ctx.chat.id);

    const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");
    const userRef = ctx.from.username ? \`\${userName} (@\${ctx.from.username})\` : userName;
    const chatType = ctx.chat.type === "private" ? "private DM" : "group chat";
    
    const systemPrompt = \`The current user talking to you is \${userRef} (Telegram ID: \${ctx.from.id}). You are currently in a \${chatType} (Chat ID: \${ctx.chat.id}). 
If the user refers to themselves ("I", "me", "my", etc.), use their Telegram ID for any tool parameters requiring a User ID. 
If you need other users' IDs, use the getChatDetailsTool to find them. 
In a private DM, expenses are usually just for the user, so default the payer and participant to the current user unless specified otherwise.\`;

    const streamInfo = await bananaAgent.stream(userMessage, {
      memory: {
        thread: String(ctx.chat.id),
        resource: \`telegram-user-\${ctx.from.id}\`,
      },
      requestContext,
      system: systemPrompt,
    });`;

content = content.replace(
  /    const requestContext = new RequestContext<\{[\s\S]*?\}\>\(\);[\s\S]*?requestContext.set\("telegramUserId", ctx.from.id\);[\s\S]*?requestContext.set\("chatId", ctx.chat.id\);[\s\S]*?const streamInfo = await bananaAgent.stream\(userMessage, \{[\s\S]*?memory: \{[\s\S]*?thread: String\(ctx.chat.id\),[\s\S]*?resource: `telegram-user-\$\{ctx.from.id\}`,\n      \},[\s\S]*?requestContext,[\s\S]*?(?:system: [^\n]+,\n      )?\}\);/g,
  replacement
);

fs.writeFileSync(agentPath, content);
